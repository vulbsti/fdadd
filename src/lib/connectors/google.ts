/**
 * Google connector: OAuth with the `drive.file` scope plus the Google Picker.
 * The person picks files in Google's own picker, which grants Aidoraa access
 * to exactly those files; `drive.file` is Google's non-sensitive scope, so no
 * restricted-scope security assessment is needed. Google Keep has no API for
 * personal accounts (only Workspace domain-wide delegation), so Keep notes come
 * in through a Google Takeout upload instead.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './token-crypto';
import type { ImportedItem } from '@/lib/imports/types';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The Picker also needs a browser API key and the Cloud project number. */
export function googlePickerConfig() {
  const apiKey = process.env.GOOGLE_PICKER_API_KEY?.trim();
  const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim();
  return apiKey && appId ? { apiKey, appId } : null;
}

export function googleRedirectUri(requestUrl: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${new URL(requestUrl).origin}/api/connectors/google/callback`;
}

export function googleAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  }).toString();
  return url.toString();
}

export class GoogleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface TokenResponse { access_token: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string }

async function tokenRequest(body: Record<string, string>) {
  const config = googleConfig();
  if (!config) throw new GoogleError(503, 'Google is not configured on this server.');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: config.clientId, client_secret: config.clientSecret }),
  });
  if (!response.ok) throw new GoogleError(response.status === 400 ? 401 : response.status, 'Google did not accept the connection.');
  return await response.json() as TokenResponse;
}

/** The ID token came straight from Google's token endpoint over TLS; only its email claim is read. */
function emailFrom(idToken: string | undefined) {
  try {
    const claims = JSON.parse(Buffer.from(idToken?.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string };
    return typeof claims.email === 'string' ? claims.email.slice(0, 320) : null;
  } catch {
    return null;
  }
}

function expiry(tokens: TokenResponse) {
  return new Date(Date.now() + Math.max(60, (tokens.expires_in ?? 3600) - 60) * 1000).toISOString();
}

export async function connectGoogle(admin: SupabaseClient, userId: string, code: string, redirectUri: string) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!tokens.scope?.split(' ').includes(GOOGLE_SCOPES[0])) throw new GoogleError(403, 'Drive access was not granted.');
  const now = new Date().toISOString();
  const saved = await admin.from('user_connector_accounts').upsert({
    user_id: userId, provider: 'google', access_token: encryptToken(tokens.access_token),
    refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, token_expires_at: expiry(tokens),
    scopes: tokens.scope ?? null, account_email: emailFrom(tokens.id_token), connected_at: now, updated_at: now,
  }, { onConflict: 'user_id,provider' });
  if (saved.error) throw new GoogleError(500, `Could not save the Google connection (${saved.error.code ?? 'database'}).`);
}

export async function googleConnection(admin: SupabaseClient, userId: string) {
  const row = await admin.from('user_connector_accounts').select('account_email,connected_at').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  if (row.error) throw new GoogleError(500, `Could not read the Google connection (${row.error.code ?? 'database'}).`);
  return row.data ? { email: (row.data.account_email as string) ?? null, connectedAt: String(row.data.connected_at) } : null;
}

/** A current access token, refreshed when it is about to expire. */
export async function googleAccessToken(admin: SupabaseClient, userId: string) {
  const row = await admin.from('user_connector_accounts').select('access_token,refresh_token,token_expires_at')
    .eq('user_id', userId).eq('provider', 'google').maybeSingle();
  if (row.error) throw new GoogleError(500, 'Could not read the Google connection.');
  if (!row.data) throw new GoogleError(401, 'Google is not connected.');
  const expiresAt = row.data.token_expires_at ? new Date(String(row.data.token_expires_at)).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return decryptToken(String(row.data.access_token));
  if (!row.data.refresh_token) throw new GoogleError(401, 'The Google connection expired. Connect Google again.');
  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptToken(String(row.data.refresh_token)) })
    .catch(() => { throw new GoogleError(401, 'The Google connection expired. Connect Google again.'); });
  const saved = await admin.from('user_connector_accounts').update({
    access_token: encryptToken(tokens.access_token), token_expires_at: expiry(tokens), updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('provider', 'google');
  if (saved.error) throw new GoogleError(500, 'Could not save the refreshed Google connection.');
  return tokens.access_token;
}

export async function disconnectGoogle(admin: SupabaseClient, userId: string) {
  const row = await admin.from('user_connector_accounts').select('refresh_token,access_token').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  const sealed = row.data?.refresh_token ?? row.data?.access_token;
  if (sealed) {
    // Best effort: also revoke the grant at Google, so the files are no longer shared with Aidoraa.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptToken(String(sealed)))}`, { method: 'POST' }).catch(() => null);
  }
  const removed = await admin.from('user_connector_accounts').delete().eq('user_id', userId).eq('provider', 'google');
  if (removed.error) throw new GoogleError(500, `Could not remove the Google connection (${removed.error.code ?? 'database'}).`);
}

async function driveFetch(token: string, path: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${DRIVE}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 429 || response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    return response;
  }
  throw new GoogleError(429, 'Google Drive is busy. Try again in a minute.');
}

/** Google's own formats are exported as text; other files are read as they are when they are text. */
const EXPORTS: Record<string, string[]> = {
  'application/vnd.google-apps.document': ['text/markdown', 'text/plain'],
  'application/vnd.google-apps.spreadsheet': ['text/csv'],
  'application/vnd.google-apps.presentation': ['text/plain'],
};
const READABLE = /^(text\/|application\/(json|xml|x-ndjson))/;

export type DriveOutcome = { item: ImportedItem } | { skipped: string };

export async function driveFileItem(admin: SupabaseClient, userId: string, fileId: string): Promise<DriveOutcome> {
  const token = await googleAccessToken(admin, userId);
  const id = encodeURIComponent(fileId);
  const meta = await driveFetch(token, `/files/${id}?fields=id,name,mimeType,createdTime,modifiedTime,webViewLink,size&supportsAllDrives=true`);
  if (meta.status === 401) throw new GoogleError(401, 'The Google connection expired. Connect Google again.');
  if (meta.status === 404 || meta.status === 403) return { skipped: 'Aidoraa does not have access to this file.' };
  if (!meta.ok) throw new GoogleError(meta.status, `Google Drive request failed (${meta.status}).`);
  const file = await meta.json() as { id: string; name?: string; mimeType?: string; createdTime?: string; modifiedTime?: string; webViewLink?: string };
  const name = file.name ?? 'Untitled';
  let body: string | null = null;
  for (const exportType of EXPORTS[file.mimeType ?? ''] ?? []) {
    const exported = await driveFetch(token, `/files/${id}/export?mimeType=${encodeURIComponent(exportType)}`);
    if (exported.ok) { body = await exported.text(); break; }
    if (exported.status === 403) return { skipped: `${name} is too large for Google to export as text.` };
  }
  if (body === null && !EXPORTS[file.mimeType ?? '']) {
    if (!READABLE.test(file.mimeType ?? '')) return { skipped: `${name} is not a text document (PDFs, images and Office files are not read yet).` };
    const media = await driveFetch(token, `/files/${id}?alt=media&supportsAllDrives=true`);
    if (!media.ok) return { skipped: `${name} could not be downloaded.` };
    body = await media.text();
  }
  if (!body?.trim()) return { skipped: `${name} is empty.` };
  const title = name.replace(/\.(txt|md|markdown|json|csv)$/i, '').slice(0, 300);
  const fenced = file.mimeType === 'application/vnd.google-apps.spreadsheet' || file.mimeType === 'text/csv' ? `\`\`\`csv\n${body.trim()}\n\`\`\`` : body;
  return { item: { externalId: file.id, kind: 'document', title, messages: [], body: fenced, sourceUrl: file.webViewLink ?? null,
    startedAt: file.createdTime ?? null, endedAt: file.modifiedTime ?? null } };
}
