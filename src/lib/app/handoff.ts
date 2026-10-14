import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export * from './handoff-links';

/**
 * One-time handoffs from the app to the web: an OAuth state for connecting
 * Notion or Google from the app, and a ticket that lets the Drive picker page
 * act for the app's user without the website cookie. Only a hash of each
 * token is stored (public.app_handoff_tickets, service role only); a token
 * names one user, one person and one purpose, and expires in minutes.
 */

export type HandoffKind = 'oauth_notion' | 'oauth_google' | 'google_picker' | 'google_picker_session';
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface Handoff { userId: string; personId: string; kind: HandoffKind; expiresAt: string }

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function issueHandoff(admin: SupabaseClient, input: { kind: HandoffKind; userId: string; personId: string; ttlMs?: number }) {
  const token = randomBytes(32).toString('base64url');
  // Expired tickets of this user go on the way in; nothing else reads them.
  await admin.from('app_handoff_tickets').delete().eq('user_id', input.userId).lt('expires_at', new Date().toISOString());
  const saved = await admin.from('app_handoff_tickets').insert({
    token_hash: hashToken(token), kind: input.kind, user_id: input.userId, profile_id: input.personId,
    expires_at: new Date(Date.now() + (input.ttlMs ?? HANDOFF_TTL_MS)).toISOString(),
  });
  if (saved.error) throw saved.error;
  return token;
}

function toHandoff(row: Record<string, unknown> | null | undefined): Handoff | null {
  return row ? { userId: String(row.user_id), personId: String(row.profile_id), kind: row.kind as HandoffKind, expiresAt: String(row.expires_at) } : null;
}

/** Use a token up: it is deleted as it is read, so a second use finds nothing. */
export async function consumeHandoff(admin: SupabaseClient, kind: HandoffKind, token: string): Promise<Handoff | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await admin.from('app_handoff_tickets').delete()
    .eq('token_hash', hashToken(token)).eq('kind', kind).gt('expires_at', new Date().toISOString())
    .select('user_id,profile_id,kind,expires_at');
  if (error) throw error;
  return toHandoff(data?.[0]);
}

/** Read a token that stays valid until it expires (the picker session). */
export async function readHandoff(admin: SupabaseClient, kind: HandoffKind, token: string): Promise<Handoff | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await admin.from('app_handoff_tickets').select('user_id,profile_id,kind,expires_at')
    .eq('token_hash', hashToken(token)).eq('kind', kind).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return toHandoff(data);
}

export async function endHandoff(admin: SupabaseClient, kind: HandoffKind, token: string) {
  if (TOKEN.test(token)) await admin.from('app_handoff_tickets').delete().eq('token_hash', hashToken(token)).eq('kind', kind);
}

/** Whether the person is still one of the user's active people. */
export async function ownsActivePerson(admin: SupabaseClient, userId: string, personId: string) {
  const { data, error } = await admin.from('astro_profiles').select('id')
    .eq('id', personId).eq('user_id', userId).eq('person_status', 'active').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
