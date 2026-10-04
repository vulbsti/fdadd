import { signEdgeToken } from '../../../cloudflare/edge/src/token.mjs';
import type { PiAuthority } from '@/lib/astro/pi-authority';

/**
 * The Cloudflare edge Worker (cloudflare/edge): a private R2 object store and
 * one live stream per run. It is optional: without EDGE_ORIGIN and
 * EDGE_SIGNING_SECRET every caller keeps using Supabase Storage.
 */
export interface EdgeConfig { origin: string; secret: string }

export function edgeConfig(env: Record<string, string | undefined> = process.env): EdgeConfig | null {
  const origin = env.EDGE_ORIGIN?.trim().replace(/\/+$/, '');
  const secret = env.EDGE_SIGNING_SECRET?.trim();
  if (!origin || !secret) return null;
  if (new URL(origin).protocol !== 'https:') throw new Error('EDGE_ORIGIN must be an HTTPS origin.');
  return { origin, secret };
}

const SERVER_TOKEN_MS = 60_000;

/** Capability for one run's sandbox; the firewall injects it, the VM never sees it. */
export function signEdgeRunToken(config: EdgeConfig, authority: PiAuthority): Promise<string> {
  return signEdgeToken({ scope: 'run', userId: authority.userId, personId: authority.personId, runId: authority.runId,
    exp: authority.expiresAt }, config.secret);
}

/** Read-only capability for the browser of the run's owner. */
export function signEdgeWatchToken(config: EdgeConfig, runId: string, ttlMs = 20 * 60 * 1000): Promise<string> {
  return signEdgeToken({ scope: 'watch', runId, exp: Date.now() + ttlMs }, config.secret);
}

export function edgeObjectUrl(config: EdgeConfig, key: string) {
  return `${config.origin}/o/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function serverFetch(config: EdgeConfig, url: string, init: RequestInit = {}) {
  const token = await signEdgeToken({ scope: 'server', exp: Date.now() + SERVER_TOKEN_MS }, config.secret);
  return fetch(url, { ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(60_000) });
}

export function edgeObjects(config: EdgeConfig) {
  return {
    async put(key: string, bytes: Buffer, contentType: string) {
      const response = await serverFetch(config, edgeObjectUrl(config, key), { method: 'PUT', body: new Uint8Array(bytes),
        headers: { 'content-type': contentType, 'content-length': String(bytes.length) } });
      if (!response.ok) throw new Error(`Edge object store rejected a write (${response.status}).`);
    },
    async get(key: string): Promise<Buffer | null> {
      const response = await serverFetch(config, edgeObjectUrl(config, key));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Edge object store read failed (${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    },
    async exists(key: string) {
      const response = await serverFetch(config, edgeObjectUrl(config, key), { method: 'HEAD' });
      if (response.status !== 200 && response.status !== 404) throw new Error(`Edge object store probe failed (${response.status}).`);
      return response.status === 200;
    },
    async remove(keys: string[]) {
      for (let index = 0; index < keys.length; index += 1000) {
        const response = await serverFetch(config, `${config.origin}/admin/delete`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keys: keys.slice(index, index + 1000) }) });
        if (!response.ok) throw new Error(`Edge object store delete failed (${response.status}).`);
      }
    },
  };
}
