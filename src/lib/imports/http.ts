import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { NotionError } from '@/lib/connectors/notion';
import { ImportError, type OwnerScope } from './store';

const NO_STORE = { 'cache-control': 'private, no-store' };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** The signed-in user and one of their active people, or a response to return. */
export async function requireOwnedPerson(personId: string): Promise<{ scope: OwnerScope; admin: ReturnType<typeof createAdminClient> } | NextResponse> {
  if (!isSupabaseConfigured()) return json({ code: 'unconfigured', message: 'Imports are not configured.' }, 503);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ code: 'forbidden', message: 'Sign in to import.' }, 401);
  const { data: profile } = await client.from('astro_profiles').select('id')
    .eq('id', personId).eq('user_id', user.id).eq('person_status', 'active').maybeSingle();
  if (!profile) return json({ code: 'not_owned_or_missing', message: 'Person was not found.' }, 404);
  return { scope: { userId: user.id, personId }, admin: createAdminClient() };
}

export async function requireUser(): Promise<{ userId: string; admin: ReturnType<typeof createAdminClient> } | NextResponse> {
  if (!isSupabaseConfigured()) return json({ code: 'unconfigured', message: 'Connectors are not configured.' }, 503);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ code: 'forbidden', message: 'Sign in first.' }, 401);
  return { userId: user.id, admin: createAdminClient() };
}

export function importErrorResponse(error: unknown) {
  if (error instanceof ImportError) {
    const status = { not_found: 404, invalid_state: 409, unsupported_import: 422, too_large: 413, internal: 500 }[error.code];
    return json({ code: error.code, message: error.message }, status);
  }
  if (error instanceof NotionError) {
    return json({ code: error.status === 401 ? 'notion_disconnected' : 'notion_error', message: error.message }, error.status === 401 ? 409 : error.status >= 500 ? 502 : error.status);
  }
  console.error('[imports] request failed', { message: error instanceof Error ? error.message : 'unknown' });
  return json({ code: 'internal', message: 'Something went wrong. Try again.' }, 500);
}
