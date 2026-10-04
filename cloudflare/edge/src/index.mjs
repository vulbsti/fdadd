import { DurableObject } from 'cloudflare:workers';
import { authorizeObject, verifyEdgeToken } from './token.mjs';

const MAX_OBJECT_BYTES = 50 * 1024 * 1024;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));

function cors(request, env) {
  const origin = request.headers.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim());
  if (!origin || !(allowed.includes('*') || allowed.includes(origin))) return {};
  // Access is decided by the bearer capability, never by cookies, so any
  // header the page wants to send may be allowed.
  return { 'access-control-allow-origin': origin, vary: 'origin',
    'access-control-allow-headers': request.headers.get('access-control-request-headers') ?? 'authorization, last-event-id' };
}

async function objects(request, env, claims, key) {
  const { allowed, digest } = authorizeObject(claims, request.method, key);
  if (!allowed) return json({ error: 'forbidden' }, 403);
  if (request.method === 'PUT') {
    const length = Number(request.headers.get('content-length'));
    if (!Number.isInteger(length) || length <= 0 || length > MAX_OBJECT_BYTES) return json({ error: 'invalid size' }, 413);
    try {
      // R2 rejects the write unless the bytes hash to the digest in the key.
      await env.BUCKET.put(key, request.body, { ...(digest ? { sha256: hexToBytes(digest) } : {}),
        httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' } });
    } catch {
      return json({ error: 'object rejected' }, 400);
    }
    return json({ stored: true });
  }
  if (request.method === 'HEAD') {
    const head = await env.BUCKET.head(key);
    return new Response(null, { status: head ? 200 : 404, headers: head ? { 'content-length': String(head.size) } : {} });
  }
  if (request.method === 'GET') {
    const object = await env.BUCKET.get(key);
    if (!object) return json({ error: 'not found' }, 404);
    return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size), 'cache-control': 'no-store' } });
  }
  return json({ error: 'unsupported' }, 405);
}

async function admin(request, env, claims, operation) {
  if (claims?.scope !== 'server' || request.method !== 'POST') return json({ error: 'forbidden' }, 403);
  const input = await request.json();
  if (operation === 'delete' && Array.isArray(input.keys) && input.keys.length <= 1000) {
    await env.BUCKET.delete(input.keys.map(String));
    return json({ deleted: input.keys.length });
  }
  if (operation === 'list' && typeof input.prefix === 'string') {
    const page = await env.BUCKET.list({ prefix: input.prefix, cursor: input.cursor || undefined, limit: 1000 });
    return json({ objects: page.objects.map((object) => ({ key: object.key, size: object.size })), cursor: page.truncated ? page.cursor : null });
  }
  return json({ error: 'unsupported' }, 400);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-max-age': '86400' } });
    if (url.pathname === '/health') return json({ ok: true });
    const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const claims = await verifyEdgeToken(bearer, env.EDGE_SIGNING_SECRET);
    if (!claims) return json({ error: 'unauthorized' }, 401, headers);

    if (url.pathname.startsWith('/o/')) return objects(request, env, claims, decodeURIComponent(url.pathname.slice(3)));
    if (url.pathname.startsWith('/admin/')) return admin(request, env, claims, url.pathname.slice(7));

    const stream = /^\/runs\/([0-9a-f-]{36})\/(events|stream)$/.exec(url.pathname);
    if (stream) {
      const [, runId, action] = stream;
      const mayPublish = claims.scope === 'server' || (claims.scope === 'run' && claims.runId === runId);
      const mayWatch = claims.scope === 'server' || (claims.scope === 'watch' && claims.runId === runId);
      if ((action === 'events' && !(mayPublish && request.method === 'POST')) || (action === 'stream' && !(mayWatch && request.method === 'GET'))) {
        return json({ error: 'forbidden' }, 403, headers);
      }
      const response = await env.RUN_STREAM.get(env.RUN_STREAM.idFromName(runId)).fetch(request);
      const merged = new Headers(response.headers);
      for (const [name, value] of Object.entries(headers)) merged.set(name, value);
      return new Response(response.body, { status: response.status, headers: merged });
    }
    return json({ error: 'not found' }, 404, headers);
  },
};
export default worker;

const PERSIST_INTERVAL_MS = 2000;
const RETAIN_AFTER_END_MS = 10 * 60 * 1000;
const RETAIN_IDLE_MS = 60 * 60 * 1000;
const encoder = new TextEncoder();
const frame = (event) => encoder.encode(`id: ${event.seq}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);

/**
 * One object per run. The runner posts ordered events; browsers hold an SSE
 * response and can reconnect from any sequence number. Events live in memory
 * and are written to storage at most every two seconds, so an evicted object
 * can still replay. The published answer never depends on this object.
 */
export class RunStream extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.events = [];
    this.persisted = 0;
    this.chunk = 0;
    this.ended = false;
    this.watchers = new Set();
    this.persistTimer = null;
    ctx.blockConcurrencyWhile(async () => {
      const chunks = await ctx.storage.list({ prefix: 'chunk:' });
      for (const events of chunks.values()) this.events.push(...events);
      this.events.sort((a, b) => a.seq - b.seq);
      this.persisted = this.events.length;
      this.chunk = chunks.size;
      this.ended = this.events.at(-1)?.kind === 'exit';
    });
  }

  async fetch(request) {
    return request.method === 'POST' ? this.publish(await request.json()) : this.watch(request);
  }

  async publish(input) {
    if (!Array.isArray(input?.events) || input.events.length > 200) return json({ error: 'invalid events' }, 400);
    let last = this.events.at(-1)?.seq ?? 0;
    for (const event of input.events) {
      // A retried post re-sends rows; anything at or below the last sequence is a duplicate.
      if (!Number.isInteger(event?.seq) || event.seq <= last || typeof event.kind !== 'string') continue;
      last = event.seq;
      this.events.push(event);
      const bytes = frame(event);
      for (const watcher of this.watchers) this.send(watcher, bytes);
      if (event.kind === 'exit') this.ended = true;
    }
    if (this.ended) {
      await this.persist();
      for (const watcher of this.watchers) this.close(watcher);
      await this.ctx.storage.setAlarm(Date.now() + RETAIN_AFTER_END_MS);
    } else {
      this.persistTimer ??= setTimeout(() => { this.persistTimer = null; void this.persist(); }, PERSIST_INTERVAL_MS);
      await this.ctx.storage.setAlarm(Date.now() + RETAIN_IDLE_MS);
    }
    return json({ accepted: true, seq: last });
  }

  async persist() {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    if (this.persisted === this.events.length) return;
    const pending = this.events.slice(this.persisted);
    this.persisted = this.events.length;
    await this.ctx.storage.put(`chunk:${String(this.chunk++).padStart(6, '0')}`, pending);
  }

  watch(request) {
    const url = new URL(request.url);
    const after = Number.parseInt(request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0', 10) || 0;
    let watcher;
    const body = new ReadableStream({
      start: (controller) => {
        watcher = { controller, keepalive: null };
        for (const event of this.events) if (event.seq > after) controller.enqueue(frame(event));
        if (this.ended) { controller.close(); return; }
        watcher.keepalive = setInterval(() => this.send(watcher, encoder.encode(': keepalive\n\n')), 15000);
        this.watchers.add(watcher);
      },
      cancel: () => this.close(watcher),
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform' } });
  }

  send(watcher, bytes) {
    try { watcher.controller.enqueue(bytes); } catch { this.close(watcher); }
  }

  close(watcher) {
    if (!watcher) return;
    clearInterval(watcher.keepalive);
    this.watchers.delete(watcher);
    try { watcher.controller.close(); } catch { /* already closed by the reader */ }
  }

  async alarm() {
    for (const watcher of this.watchers) this.close(watcher);
    await this.ctx.storage.deleteAll();
    this.events = [];
    this.persisted = 0;
    this.chunk = 0;
  }
}
