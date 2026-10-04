import { createAdminClient } from '@/lib/supabase/admin';
import { edgeConfig, edgeObjects } from '@/lib/edge/client';

export const PI_BUCKET = 'pi-workspaces';

/**
 * Where immutable Pi workspace bytes live (checkpoint archives and
 * content-addressed file blobs). Receipts stay in Postgres either way.
 */
export interface PiObjectStore {
  /** Store bytes at a path that is never overwritten; an existing object is a completed write. */
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  exists(path: string): Promise<boolean>;
  remove(paths: string[]): Promise<void>;
}

export function supabasePiObjects(): PiObjectStore {
  const bucket = () => createAdminClient().storage.from(PI_BUCKET);
  return {
    async put(path, bytes, contentType) {
      const uploaded = await bucket().upload(path, bytes, { contentType, upsert: false });
      if (uploaded.error && !(await bucket().exists(path)).data) throw new Error('Workspace object could not be saved.');
    },
    async get(path) {
      const result = await bucket().download(path);
      return result.error || !result.data ? null : Buffer.from(await result.data.arrayBuffer());
    },
    async exists(path) { return (await bucket().exists(path)).data === true; },
    async remove(paths) {
      if (!paths.length) return;
      const removed = await bucket().remove(paths);
      if (removed.error) throw new Error('Workspace objects could not be removed.');
    },
  };
}

/**
 * With the edge configured, new bytes go to R2. Objects written before the
 * move are still in Supabase Storage: a read that misses R2 falls back to it
 * and copies the object across, so each one moves the first time it is used.
 */
export function migratingPiObjects(edge: PiObjectStore, legacy: PiObjectStore): PiObjectStore {
  const adopt = async (path: string) => {
    const bytes = await legacy.get(path);
    if (bytes) await edge.put(path, bytes, path.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    return bytes;
  };
  return {
    put: (path, bytes, contentType) => edge.put(path, bytes, contentType),
    get: async (path) => await edge.get(path) ?? adopt(path),
    exists: async (path) => await edge.exists(path) || (await adopt(path)) !== null,
    remove: async (paths) => { await Promise.all([edge.remove(paths), legacy.remove(paths)]); },
  };
}

export function piObjects(): PiObjectStore {
  const config = edgeConfig();
  return config ? migratingPiObjects(edgeObjects(config), supabasePiObjects()) : supabasePiObjects();
}
