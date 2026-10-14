import { describe, expect, it } from 'vitest';
import { parseFingerprints, UPLOAD_KEY_SHA256 } from './fingerprints';

describe('parseFingerprints', () => {
  it('returns only the upload key when no extras are set', () => {
    expect(parseFingerprints(undefined)).toEqual([UPLOAD_KEY_SHA256]);
    expect(parseFingerprints('')).toEqual([UPLOAD_KEY_SHA256]);
  });

  it('adds extras trimmed and uppercased, dropping blanks and duplicates', () => {
    const extra = ` aa:bb:cc , ,${UPLOAD_KEY_SHA256.toLowerCase()},AA:BB:CC`;
    expect(parseFingerprints(extra)).toEqual([UPLOAD_KEY_SHA256, 'AA:BB:CC']);
  });
});
