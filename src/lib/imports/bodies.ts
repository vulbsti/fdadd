import { createHash } from 'node:crypto';
import { edgeConfig, edgeObjects } from '@/lib/edge/client';
import type { ImportedMessage } from './types';

/**
 * Imported bodies (a conversation's messages or a document's text) are kept
 * in the edge object store when one is configured, so a large export never
 * sits in Postgres. Without it they stay in the row, as before.
 */
export interface ImportBodyStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(keys: string[]): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export interface ImportBody { messages: ImportedMessage[]; body: string | null }

export function importBodies(): ImportBodyStore | null {
  const config = edgeConfig();
  return config ? edgeObjects(config) : null;
}

export const importBodyPrefix = (scope: { userId: string; personId: string }) => `${scope.userId}/${scope.personId}/imports/`;

export function encodeImportBody(scope: { userId: string; personId: string }, importId: string, content: ImportBody) {
  const bytes = Buffer.from(JSON.stringify({ messages: content.messages, body: content.body }));
  return { bytes, key: `${importBodyPrefix(scope)}${importId}/${createHash('sha256').update(bytes).digest('hex')}.json` };
}

export function decodeImportBody(bytes: Buffer): ImportBody {
  const parsed = JSON.parse(bytes.toString('utf8')) as Partial<ImportBody>;
  if (!Array.isArray(parsed.messages)) throw new Error('Stored import body is invalid.');
  return { messages: parsed.messages, body: typeof parsed.body === 'string' ? parsed.body : null };
}

/** Stored bodies no row names any more: unselected, replaced or deleted items. */
export function orphanedImportBodies(stored: string[], referenced: Iterable<string>) {
  const keep = new Set(referenced);
  return stored.filter((key) => !keep.has(key));
}

/** Run tasks a few at a time; one large import is many small objects. */
export async function inBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(task)));
  }
  return results;
}
