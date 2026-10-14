import { createHash, randomBytes } from 'node:crypto';

/**
 * Google sign-in that returns to our own domain instead of *.supabase.co.
 *
 * Supabase's hosted OAuth flow sends Google's redirect to
 * <project>.supabase.co, which some ISPs' DNS blocks. Here Google redirects to
 * /auth/google/callback, the server swaps the code for an ID token and hands it
 * to Supabase with signInWithIdToken. The client ID must be one Supabase's
 * Google provider accepts (Authentication > Providers > Google > Client IDs).
 */

export const GOOGLE_STATE_COOKIE = 'aidoraa-google-oauth';
export const GOOGLE_CALLBACK_PATH = '/auth/google/callback';

export type GoogleSignInConfig = { clientId: string; clientSecret: string };

export function googleSignInConfig(env: Record<string, string | undefined> = process.env): GoogleSignInConfig | null {
  const clientId = env.GOOGLE_SIGNIN_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_SIGNIN_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export type GoogleFlowState = { state: string; nonce: string; next: string };

export function newFlowState(next: string): GoogleFlowState {
  return {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    next,
  };
}

/** Google gets the SHA-256 of the nonce; Supabase gets the raw value and checks it. */
export function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex');
}

export function googleAuthorizeUrl(config: GoogleSignInConfig, redirectUri: string, flow: GoogleFlowState): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: hashNonce(flow.nonce),
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export function encodeFlowCookie(flow: GoogleFlowState): string {
  return Buffer.from(JSON.stringify(flow)).toString('base64url');
}

export function decodeFlowCookie(value: string | undefined): GoogleFlowState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<GoogleFlowState>;
    if (typeof parsed.state !== 'string' || typeof parsed.nonce !== 'string' || typeof parsed.next !== 'string') return null;
    return { state: parsed.state, nonce: parsed.nonce, next: parsed.next };
  } catch {
    return null;
  }
}

export async function exchangeCodeForIdToken(
  config: GoogleSignInConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: unknown };
  return typeof body.id_token === 'string' ? body.id_token : null;
}
