import { describe, expect, it } from 'vitest';
import { migratingPiObjects, type PiObjectStore } from './pi-objects';
import { edgeConfig, edgeObjectUrl, signEdgeRunToken, signEdgeWatchToken } from '@/lib/edge/client';
import { authorizeObject, verifyEdgeToken } from '../../../cloudflare/edge/src/token.mjs';
import type { PiAuthority } from './pi-authority';

function memoryStore(initial: Record<string, string> = {}) {
  const objects = new Map<string, Buffer>(Object.entries(initial).map(([path, text]) => [path, Buffer.from(text)]));
  const store: PiObjectStore = {
    async put(path, bytes) { if (!objects.has(path)) objects.set(path, bytes); },
    async get(path) { return objects.get(path) ?? null; },
    async exists(path) { return objects.has(path); },
    async remove(paths) { for (const path of paths) objects.delete(path); },
  };
  return { store, objects };
}

describe('Pi object store during the move to the edge', () => {
  it('writes new objects to the edge only', async () => {
    const edge = memoryStore(), legacy = memoryStore();
    await migratingPiObjects(edge.store, legacy.store).put('u/p/blobs/a', Buffer.from('new'), 'application/octet-stream');
    expect([...edge.objects.keys()]).toEqual(['u/p/blobs/a']);
    expect(legacy.objects.size).toBe(0);
  });

  it('reads an older object from Supabase once and copies it across', async () => {
    const edge = memoryStore(), legacy = memoryStore({ 'u/p/r/old.json': '{"sequence":1}' });
    const store = migratingPiObjects(edge.store, legacy.store);
    expect((await store.get('u/p/r/old.json'))?.toString()).toBe('{"sequence":1}');
    expect(edge.objects.get('u/p/r/old.json')?.toString()).toBe('{"sequence":1}');
    legacy.objects.clear();
    expect((await store.get('u/p/r/old.json'))?.toString()).toBe('{"sequence":1}');
  });

  it('treats an older blob as present and moves it, so a sandbox can fetch it from the edge', async () => {
    const edge = memoryStore(), legacy = memoryStore({ 'u/p/blobs/old': 'bytes' });
    const store = migratingPiObjects(edge.store, legacy.store);
    await expect(store.exists('u/p/blobs/old')).resolves.toBe(true);
    expect(edge.objects.has('u/p/blobs/old')).toBe(true);
    await expect(store.exists('u/p/blobs/never')).resolves.toBe(false);
    await expect(store.get('u/p/blobs/never')).resolves.toBeNull();
  });

  it('removes from both places', async () => {
    const edge = memoryStore({ a: '1' }), legacy = memoryStore({ a: '1', b: '2' });
    await migratingPiObjects(edge.store, legacy.store).remove(['a', 'b']);
    expect(edge.objects.size + legacy.objects.size).toBe(0);
  });
});

describe('edge capabilities signed by the app and checked by the Worker', () => {
  const config = { origin: 'https://edge.example', secret: 'shared-secret' };
  const authority: PiAuthority = {
    runId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000002',
    personId: '30000000-0000-4000-8000-000000000003', sessionId: '40000000-0000-4000-8000-000000000004',
    modeEpoch: 1, privacyEpoch: 1, birthRevision: 1, astrologyEnabled: true, expiresAt: Date.now() + 60_000,
  };
  const digest = 'b'.repeat(64);

  it('is off unless both settings are present, and insists on HTTPS', () => {
    expect(edgeConfig({})).toBeNull();
    expect(edgeConfig({ EDGE_ORIGIN: 'https://edge.example/' })).toBeNull();
    expect(edgeConfig({ EDGE_ORIGIN: ' https://edge.example/ ', EDGE_SIGNING_SECRET: ' s\n' })).toEqual({ origin: 'https://edge.example', secret: 's' });
    expect(() => edgeConfig({ EDGE_ORIGIN: 'http://edge.example', EDGE_SIGNING_SECRET: 's' })).toThrow('HTTPS');
  });

  it('gives a run its own archives and its person blobs, expiring with the run authority', async () => {
    const claims = await verifyEdgeToken(await signEdgeRunToken(config, authority), config.secret);
    expect(claims).toMatchObject({ scope: 'run', runId: authority.runId, exp: authority.expiresAt });
    const own = `${authority.userId}/${authority.personId}/${authority.runId}/${digest}.json`;
    expect(authorizeObject(claims, 'PUT', own)).toEqual({ allowed: true, digest });
    expect(authorizeObject(claims, 'PUT', `${authority.userId}/${authority.personId}/${authority.sessionId}/${digest}.json`).allowed).toBe(false);
    expect(await verifyEdgeToken(await signEdgeRunToken(config, authority), config.secret, authority.expiresAt + 1)).toBeNull();
    expect(edgeObjectUrl(config, own)).toBe(`https://edge.example/o/${own}`);
  });

  it('gives a browser a watch-only capability for one run', async () => {
    const claims = await verifyEdgeToken(await signEdgeWatchToken(config, authority.runId), config.secret);
    expect(claims).toMatchObject({ scope: 'watch', runId: authority.runId });
    expect(authorizeObject(claims, 'GET', `${authority.userId}/${authority.personId}/blobs/${digest}`).allowed).toBe(false);
  });
});
