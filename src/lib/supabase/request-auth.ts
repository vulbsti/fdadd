import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { getSupabasePublicConfig } from './config';
import { createClient as createCookieClient } from './server';

/**
 * The token from `Authorization: Bearer <supabase access token>`, as sent by
 * the mobile app. The website never sends it and keeps using the cookie.
 */
export function bearerToken(authorization: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  return match ? match[1] : null;
}

/**
 * A Supabase client that acts as the signed-in user: the access token travels
 * as the global Authorization header, so row level security applies exactly
 * as it does for the cookie client. It always talks to the real project URL;
 * only the app's own sign-in goes through the /sb proxy.
 */
export function createTokenClient(token: string): SupabaseClient {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createSupabaseClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export interface RequestUser {
  client: SupabaseClient;
  user: User;
  /** Set when the request authenticated with a Bearer token rather than the cookie. */
  accessToken: string | null;
}

/**
 * The verified user of this request, from the Bearer token when one is sent,
 * otherwise from the Supabase cookie. A request that sends a Bearer token is
 * never silently authenticated by a cookie instead.
 */
export async function getRequestUser(): Promise<RequestUser | null> {
  const token = bearerToken((await headers()).get('authorization'));
  if (token) {
    const client = createTokenClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return { client, user: data.user, accessToken: token };
  }
  const client = await createCookieClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user, accessToken: null } : null;
}
