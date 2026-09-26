import { describe, expect, it } from 'vitest';
import { decodePiTransfer, encodePiTransfer, isPiArtifactPath, PI_CHUNK_BYTES, PI_MAX_ARCHIVE_BYTES } from './pi-transfer';

describe('Pi checkpoint byte transfer', () => {
  it('round-trips a checkpoint larger than 4.5 MB without damaging split UTF-8 characters', () => {
    const bytes = Buffer.from(JSON.stringify({ session: 'क😀é中'.repeat(500_000), files: [{ content: '終わり' }] }));
    expect(bytes.length).toBeGreaterThan(4_500_000);
    const { manifest, chunks } = encodePiTransfer(bytes);
    expect(manifest.parts).toBeGreaterThan(4);
    for (const content of chunks) expect(Buffer.byteLength(JSON.stringify({ manifest, content }))).toBeLessThan(1_500_000);
    expect(decodePiTransfer(manifest, chunks).equals(bytes)).toBe(true);
    expect(JSON.parse(decodePiTransfer(manifest, chunks).toString('utf8'))).toEqual(JSON.parse(bytes.toString('utf8')));
  });

  it('rejects missing, altered, or reordered pieces', () => {
    const transfer = encodePiTransfer(Buffer.concat([Buffer.alloc(PI_CHUNK_BYTES, 'a'), Buffer.alloc(PI_CHUNK_BYTES, 'b')]));
    expect(() => decodePiTransfer(transfer.manifest, transfer.chunks.slice(1))).toThrow('missing');
    expect(() => decodePiTransfer(transfer.manifest, [...transfer.chunks].reverse())).toThrow('digest mismatch');
    const changed = [...transfer.chunks];
    changed[0] = Buffer.alloc(PI_CHUNK_BYTES, 'c').toString('base64');
    expect(() => decodePiTransfer(transfer.manifest, changed)).toThrow('digest mismatch');
  });

  it('rejects noncanonical base64 and the wrong last-piece length', () => {
    const transfer = encodePiTransfer(Buffer.from('😀'));
    expect(() => decodePiTransfer(transfer.manifest, [transfer.chunks[0] + '\n'])).toThrow('Invalid');
    expect(() => decodePiTransfer(transfer.manifest, [Buffer.from('wrong').toString('base64')])).toThrow('incomplete');
  });

  it('fails explicitly above the 50 MiB prototype budget', () => {
    expect(() => encodePiTransfer(Buffer.alloc(PI_MAX_ARCHIVE_BYTES + 1))).toThrow('50 MiB');
    const transfer = encodePiTransfer(Buffer.from('ok'));
    expect(() => decodePiTransfer({ ...transfer.manifest, byteLength: PI_MAX_ARCHIVE_BYTES + 1 }, transfer.chunks)).toThrow('50 MiB');
  });

  it('preserves safe spaces and Unicode artifact names without permitting traversal', () => {
    for (const path of ['work/मेरी notes.md', 'outputs/2026/時期 😀.json', 'proposals/.draft', 'astrology/calculations/dated periods.txt']) {
      expect(isPiArtifactPath(path), path).toBe(true);
    }
    for (const path of ['/work/file', 'person/file', 'work/', 'work//file', 'work/../file', 'work/./file', 'work/a\\b', 'work/a\0b']) {
      expect(isPiArtifactPath(path), path).toBe(false);
    }
  });
});
