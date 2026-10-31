import { createSign, randomBytes } from 'node:crypto';
import { googleSignInConfig, type GoogleSignInConfig } from '@/lib/auth/google-signin';

/**
 * One-tap signup for the Android closed test.
 *
 * Play's closed track lists a Google Group as its testers. Consumer
 * @googlegroups.com groups can't be joined on someone's behalf, so the track
 * points at a Cloud Identity (free) group on aidoraa.com instead. A visitor
 * signs in with Google on /beta, the server adds that verified email to the
 * group with a service account that holds the Groups Admin role, and the
 * visitor goes on to Play's opt-in page. Setup: docs/operations/beta-testers.md.
 */

export const BETA_PACKAGE = 'com.aidoraa.app';
export const PLAY_OPT_IN_URL = `https://play.google.com/apps/testing/${BETA_PACKAGE}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${BETA_PACKAGE}`;
/** The old consumer group, still used when the one-tap flow is not configured. */
export const MANUAL_GROUP_URL = 'https://groups.google.com/g/aidoraa-testers';

export const BETA_STATE_COOKIE = 'aidoraa-beta-oauth';
export const BETA_CALLBACK_PATH = '/beta/callback';

const GROUPS_SCOPE = 'https://www.googleapis.com/auth/cloud-identity.groups';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const CLOUD_IDENTITY = 'https://cloudidentity.googleapis.com/v1';

type Env = Record<string, string | undefined>;

export interface ServiceAccount { clientEmail: string; privateKey: string; tokenUri: string }
export interface BetaSignupConfig { oauth: GoogleSignInConfig; group: string; serviceAccount: ServiceAccount }

function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8')) as {
      client_email?: unknown; private_key?: unknown; token_uri?: unknown;
    };
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      tokenUri: typeof parsed.token_uri === 'string' ? parsed.token_uri : DEFAULT_TOKEN_URI,
    };
  } catch {
    return null;
  }
}

/**
 * Everything the one-tap flow needs, or null to show the manual steps.
 * Sign-in uses the site's Google sign-in client, else the Drive import client.
 * The service account is its own, else the Play billing one (give it the role).
 */
export function betaSignupConfig(env: Env = process.env): BetaSignupConfig | null {
  const group = env.BETA_TESTERS_GROUP?.trim().toLowerCase();
  const fallbackId = env.GOOGLE_CLIENT_ID?.trim();
  const fallbackSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const oauth = googleSignInConfig(env) ?? (fallbackId && fallbackSecret ? { clientId: fallbackId, clientSecret: fallbackSecret } : null);
  const serviceAccount = parseServiceAccount(env.BETA_GROUPS_SERVICE_ACCOUNT_JSON)
    ?? parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  if (!group || !group.includes('@') || !oauth || !serviceAccount) return null;
  return { oauth, group, serviceAccount };
}

export function newBetaState(): string {
  return randomBytes(24).toString('base64url');
}

export function betaAuthorizeUrl(oauth: GoogleSignInConfig, redirectUri: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    // The account matters: it must be the one on their phone's Play Store.
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/**
 * Swap the code for an ID token and return its verified email. The token comes
 * straight from Google's token endpoint over TLS, so its claims are trusted
 * without a signature check; audience and email_verified are still checked.
 */
export async function verifiedEmailFromCode(
  oauth: GoogleSignInConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (typeof body?.id_token !== 'string') return null;
  const payload = body.id_token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      aud?: unknown; email?: unknown; email_verified?: unknown;
    };
    if (claims.aud !== oauth.clientId) return null;
    if (claims.email_verified !== true && claims.email_verified !== 'true') return null;
    return typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function serviceAccountAssertion(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const encode = (value: string | Buffer) => Buffer.from(value).toString('base64url');
  const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encode(JSON.stringify({
    iss: account.clientEmail, scope: GROUPS_SCOPE, aud: account.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600,
  }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.privateKey);
  return `${header}.${claims}.${encode(signature)}`;
}

export class BetaGroupError extends Error {}

async function accessToken(account: ServiceAccount, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(account.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountAssertion(account),
    }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !body?.access_token) throw new BetaGroupError(`service account token failed (${response.status})`);
  return body.access_token;
}

/** Adds the email to the testers group. Already being a member counts as success. */
export async function addTester(config: BetaSignupConfig, email: string, fetchImpl: typeof fetch = fetch): Promise<'added' | 'already'> {
  const token = await accessToken(config.serviceAccount, fetchImpl);
  const headers = { authorization: `Bearer ${token}` };

  const lookup = await fetchImpl(`${CLOUD_IDENTITY}/groups:lookup?${new URLSearchParams({ 'groupKey.id': config.group })}`, { headers });
  const group = (await lookup.json().catch(() => null)) as { name?: string } | null;
  if (!lookup.ok || !group?.name) throw new BetaGroupError(`group lookup failed (${lookup.status})`);

  const create = await fetchImpl(`${CLOUD_IDENTITY}/${group.name}/memberships`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ preferredMemberKey: { id: email }, roles: [{ name: 'MEMBER' }] }),
  });
  if (create.status === 409) return 'already';
  if (!create.ok) {
    const detail = await create.text().catch(() => '');
    throw new BetaGroupError(`add member failed (${create.status}) ${detail.slice(0, 300)}`);
  }
  return 'added';
}
