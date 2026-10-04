import { describe, expect, it } from 'vitest';
import { decodeImportBody, encodeImportBody, importBodyPrefix, inBatches, orphanedImportBodies } from './bodies';

const scope = { userId: '20000000-0000-4000-8000-000000000002', personId: '30000000-0000-4000-8000-000000000003' };

describe('imported bodies in the object store', () => {
  it('round-trips a conversation under the owner prefix at a content address', () => {
    const content = { messages: [{ role: 'user' as const, speaker: 'UG', text: 'नमस्ते 😀', at: null }], body: null };
    const first = encodeImportBody(scope, 'import-1', content);
    expect(first.key).toMatch(new RegExp(`^${importBodyPrefix(scope)}import-1/[a-f0-9]{64}\\.json$`));
    expect(encodeImportBody(scope, 'import-1', content).key).toBe(first.key);
    expect(decodeImportBody(first.bytes)).toEqual(content);
    expect(decodeImportBody(encodeImportBody(scope, 'import-1', { messages: [], body: 'A note' }).bytes)).toEqual({ messages: [], body: 'A note' });
  });

  it('refuses bytes that are not an import body', () => {
    expect(() => decodeImportBody(Buffer.from('{"body":"x"}'))).toThrow('invalid');
    expect(() => decodeImportBody(Buffer.from('not json'))).toThrow();
  });

  it('finds stored bodies no row names, and nothing when every one is named', () => {
    expect(orphanedImportBodies(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    expect(orphanedImportBodies(['a'], ['a', 'z'])).toEqual([]);
  });

  it('runs in bounded batches and keeps order', async () => {
    let running = 0, peak = 0;
    const results = await inBatches([1, 2, 3, 4, 5], 2, async (value) => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
