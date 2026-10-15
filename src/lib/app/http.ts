import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRequestUser } from '@/lib/supabase/request-auth';
import { appVersionGate } from './version';

/**
 * Shared front door for /api/app/v1/*: the app-version gate, then the user
 * (Bearer token from the app, or the website's cookie). Errors are always
 * `{ code, message }` and never carry server details.
 */

const NO_STORE = { 'cache-control': 'private, no-store' };

export function appJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function appError(status: number, code: string, message: string) {
  return appJson({ code, message }, status);
}

export interface AppRequestContext {
  user: User;
  userId: string;
  /** The user's own client: row level security applies. */
  client: SupabaseClient;
  /** The Bearer token, when the request used one. */
  accessToken: string | null;
}

export async function requireAppUser(request: Request): Promise<AppRequestContext | NextResponse> {
  const gated = appVersionGate(request);
  if (gated) return gated;
  if (!isSupabaseConfigured()) return appError(503, 'unconfigured', 'Aidoraa is not available right now. Please try again later.');
  const authed = await getRequestUser();
  if (!authed) return appError(401, 'unauthenticated', 'Please sign in again.');
  return { user: authed.user, userId: authed.user.id, client: authed.client, accessToken: authed.accessToken };
}

/** Log a failure without private values and answer with a generic message. */
export function appFailure(scope: string, error: unknown, message = 'Something went wrong. Please try again.') {
  const detail = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code)
    : error instanceof Error ? error.message : 'unknown';
  console.error(`[app-api] ${scope} failed`, { detail });
  return appError(500, 'internal', message);
}
