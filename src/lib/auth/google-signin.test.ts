import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  decodeFlowCookie,
  encodeFlowCookie,
  exchangeCodeForIdToken,
  googleAuthorizeUrl,
  googleSignInConfig,
  newFlowState,
} from './google-signin';
import { supabaseAuthStorageKey } from '@/lib/supabase/config';

const config = { clientId: 'client-id', clientSecret: 'secret' };

describe('google sign-in', () => {
  it('is off until both client values are set', () => {
    expect(googleSignInConfig({ GOOGLE_SIGNIN_CLIENT_ID: 'a' })).toBeNull();
    expect(
      googleSignInConfig({ GOOGLE_SIGNIN_CLIENT_ID: ' a ', GOOGLE_SIGNIN_CLIENT_SECRET: 'b' })
    ).toEqual({ clientId: 'a', clientSecret: 'b' });
  });

  it('sends Google our own callback and the hashed nonce', () => {
    const flow = newFlowState('/astrologer');
    const url = new URL(googleAuthorizeUrl(config, 'https://www.aidoraa.com/auth/google/callback', flow));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://www.aidoraa.com/auth/google/callback');
    expect(url.searchParams.get('state')).toBe(flow.state);
    expect(url.searchParams.get('nonce')).toBe(createHash('sha256').update(flow.nonce).digest('hex'));
  });

  it('round-trips the flow cookie and rejects junk', () => {
    const flow = newFlowState('/astrologer');
    expect(decodeFlowCookie(encodeFlowCookie(flow))).toEqual(flow);
    expect(decodeFlowCookie('not-base64-json')).toBeNull();
    expect(decodeFlowCookie(undefined)).toBeNull();
  });

  it('returns the ID token from Google, or null on failure', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: 'jwt' }), { status: 200 }));
    await expect(exchangeCodeForIdToken(config, 'code', 'https://x/cb', ok)).resolves.toBe('jwt');
    expect(String(ok.mock.calls[0][1].body)).toContain('grant_type=authorization_code');
    const bad = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(exchangeCodeForIdToken(config, 'code', 'https://x/cb', bad)).resolves.toBeNull();
  });

  it('keeps the auth cookie name of the real project URL', () => {
    expect(supabaseAuthStorageKey('https://ezanfqbewuqttatrkvhf.supabase.co')).toBe('sb-ezanfqbewuqttatrkvhf-auth-token');
    expect(supabaseAuthStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
  });
});
