import { describe, expect, it } from 'vitest';
import { piRuntimeEnabled, signPiAuthority, verifyPiAuthority, type PiAuthority } from './pi-authority';

const scope: PiAuthority = { runId: '40000000-0000-4000-8000-000000000001', userId: '40000000-0000-4000-8000-000000000002',
  personId: '40000000-0000-4000-8000-000000000003', sessionId: '40000000-0000-4000-8000-000000000004',
  modeEpoch: 2, privacyEpoch: 3, birthRevision: 4, astrologyEnabled: true, expiresAt: 1000 };
describe('Pi capability authority', () => {
  it('preserves every owner, conversation and consent dependency', () => {
    expect(verifyPiAuthority(signPiAuthority(scope, 'test-secret'), 'test-secret', 999)).toEqual(scope);
  });
  it('rejects tampering, wrong secrets, expired and malformed capabilities', () => {
    const token = signPiAuthority(scope, 'test-secret');
    expect(() => verifyPiAuthority(token, 'wrong-secret', 999)).toThrow();
    expect(() => verifyPiAuthority(token, 'test-secret', 1000)).toThrow();
    expect(() => verifyPiAuthority(`${token}.extra`, 'test-secret', 999)).toThrow();
    const changed = Buffer.from(JSON.stringify({ ...scope, astrologyEnabled: false })).toString('base64url');
    expect(() => verifyPiAuthority(`${changed}.${token.split('.')[1]}`, 'test-secret', 999)).toThrow();
  });
  it('cannot opt production into the preview runtime', () => {
    const staging = { NODE_ENV: 'test', ASTROLOGER_RUNTIME: 'pi', NEXT_PUBLIC_SUPABASE_URL: 'https://wtloawiwntyjiidjbmuk.supabase.co', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv;
    expect(piRuntimeEnabled(staging)).toBe(true);
    expect(piRuntimeEnabled({ ...staging, ASTROLOGER_RUNTIME: '' })).toBe(false);
    expect(() => piRuntimeEnabled({ ...staging, VERCEL_ENV: 'production' })).toThrow();
    expect(() => piRuntimeEnabled({ ...staging, NEXT_PUBLIC_SUPABASE_URL: 'https://ezanfqbewuqttatrkvhf.supabase.co' })).toThrow();
  });
});
