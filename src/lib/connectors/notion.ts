/**
 * Notion connector: OAuth (public integration), page search and page content
 * as Markdown. The person chooses which pages the integration may see on
 * Notion's own consent screen, then which of those to import here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './token-crypto';
import type { ImportedItem } from '@/lib/imports/types';

const API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2026-03-11';

export function notionConfig() {
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function notionRedirectUri(requestUrl: string) {
  return process.env.NOTION_REDIRECT_URI?.trim() || `${new URL(requestUrl).origin}/api/connectors/notion/callback`;
}

export function notionAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL(`${API}/oauth/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', owner: 'user', redirect_uri: redirectUri, state }).toString();
  return url.toString();
}

export class NotionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface TokenResponse {
  access_token: string; refresh_token?: string | null; bot_id?: string; workspace_id?: string; workspace_name?: string | null;
}

async function tokenRequest(body: Record<string, string>) {
  const config = notionConfig();
  if (!config) throw new NotionError(503, 'Notion is not configured on this server.');
  const response = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'content-type': 'application/json',
      'notion-version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new NotionError(response.status, 'Notion did not accept the connection.');
  return await response.json() as TokenResponse;
}

async function saveTokens(admin: SupabaseClient, userId: string, tokens: TokenResponse, previous?: { refresh_token: string | null }) {
  const now = new Date().toISOString();
  const refresh = tokens.refresh_token ?? (previous?.refresh_token ? decryptToken(previous.refresh_token) : null);
  const row: Record<string, unknown> = {
    user_id: userId, provider: 'notion', access_token: encryptToken(tokens.access_token),
    refresh_token: refresh ? encryptToken(refresh) : null, updated_at: now,
  };
  if (!previous) Object.assign(row, { workspace_id: tokens.workspace_id ?? null, workspace_name: tokens.workspace_name ?? null, bot_id: tokens.bot_id ?? null, connected_at: now });
  const saved = await admin.from('user_connector_accounts').upsert(row, { onConflict: 'user_id,provider' });
  if (saved.error) throw new NotionError(500, `Could not save the Notion connection (${saved.error.code ?? 'database'}).`);
}

export async function connectNotion(admin: SupabaseClient, userId: string, code: string, redirectUri: string) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  await saveTokens(admin, userId, tokens);
  return { workspaceName: tokens.workspace_name ?? null };
}

export async function notionConnection(admin: SupabaseClient, userId: string) {
  const row = await admin.from('user_connector_accounts').select('workspace_name,connected_at')
    .eq('user_id', userId).eq('provider', 'notion').maybeSingle();
  if (row.error) throw new NotionError(500, `Could not read the Notion connection (${row.error.code ?? 'database'}).`);
  return row.data ? { workspaceName: (row.data.workspace_name as string) ?? null, connectedAt: String(row.data.connected_at) } : null;
}

export async function disconnectNotion(admin: SupabaseClient, userId: string) {
  const removed = await admin.from('user_connector_accounts').delete().eq('user_id', userId).eq('provider', 'notion');
  if (removed.error) throw new NotionError(500, `Could not remove the Notion connection (${removed.error.code ?? 'database'}).`);
}

/** Authenticated Notion call: refreshes an expired token once, and waits out rate limits. */
async function notionFetch(admin: SupabaseClient, userId: string, path: string, init: RequestInit = {}) {
  const row = await admin.from('user_connector_accounts').select('access_token,refresh_token').eq('user_id', userId).eq('provider', 'notion').maybeSingle();
  if (row.error) throw new NotionError(500, 'Could not read the Notion connection.');
  if (!row.data) throw new NotionError(401, 'Notion is not connected.');
  let token = decryptToken(String(row.data.access_token));
  let refreshed = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION, 'content-type': 'application/json' },
    });
    if (response.status === 429) {
      const wait = Math.min(30, Number(response.headers.get('retry-after') ?? 1) || 1);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    if (response.status === 401 && !refreshed && row.data.refresh_token) {
      refreshed = true;
      const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptToken(String(row.data.refresh_token)) })
        .catch(() => { throw new NotionError(401, 'The Notion connection expired. Connect Notion again.'); });
      await saveTokens(admin, userId, tokens, { refresh_token: row.data.refresh_token as string | null });
      token = tokens.access_token;
      continue;
    }
    if (response.status === 401) throw new NotionError(401, 'The Notion connection expired. Connect Notion again.');
    if (!response.ok) throw new NotionError(response.status, `Notion request failed (${response.status}).`);
    return await response.json() as Record<string, unknown>;
  }
  throw new NotionError(429, 'Notion is busy. Try again in a minute.');
}

type NotionPage = Record<string, unknown> & { id: string; url?: string; last_edited_time?: string; created_time?: string; properties?: Record<string, unknown>; parent?: { type?: string } };

export function notionTitle(page: NotionPage) {
  for (const property of Object.values(page.properties ?? {})) {
    const value = property as { type?: string; title?: Array<{ plain_text?: string }> };
    if (value?.type === 'title') return (value.title ?? []).map((part) => part.plain_text ?? '').join('').trim() || 'Untitled';
  }
  return 'Untitled';
}

export interface NotionPageSummary { id: string; title: string; url: string | null; lastEditedAt: string | null; parent: string | null }

export async function searchNotionPages(admin: SupabaseClient, userId: string, input: { cursor?: string | null; query?: string | null }) {
  const body: Record<string, unknown> = {
    filter: { property: 'object', value: 'page' },
    sort: { timestamp: 'last_edited_time', direction: 'descending' },
    page_size: 100,
  };
  if (input.cursor) body.start_cursor = input.cursor;
  if (input.query) body.query = input.query;
  const result = await notionFetch(admin, userId, '/search', { method: 'POST', body: JSON.stringify(body) });
  const pages = ((result.results ?? []) as NotionPage[]).filter((page) => page.object === 'page' && !page.in_trash && !page.archived);
  return {
    pages: pages.map((page): NotionPageSummary => ({ id: page.id, title: notionTitle(page), url: page.url ?? null,
      lastEditedAt: page.last_edited_time ?? null, parent: page.parent?.type ?? null })),
    nextCursor: result.has_more ? String(result.next_cursor) : null,
  };
}

/** One page as an importable document, with any blocks Notion held back fetched too. */
export async function notionPageItem(admin: SupabaseClient, userId: string, pageId: string): Promise<ImportedItem | null> {
  const id = encodeURIComponent(pageId);
  const page = await notionFetch(admin, userId, `/pages/${id}`) as NotionPage;
  const content = await notionFetch(admin, userId, `/pages/${id}/markdown`);
  let markdown = String(content.markdown ?? '');
  if (content.truncated) {
    for (const blockId of (content.unknown_block_ids ?? []) as string[]) {
      const more = await notionFetch(admin, userId, `/pages/${encodeURIComponent(blockId)}/markdown`).catch(() => null);
      if (more?.markdown) markdown += `\n\n${String(more.markdown)}`;
    }
  }
  if (!markdown.trim()) return null;
  return {
    externalId: page.id, kind: 'document', title: notionTitle(page).slice(0, 300), messages: [], body: markdown,
    sourceUrl: page.url ?? null, startedAt: page.created_time ?? null, endedAt: page.last_edited_time ?? null,
  };
}
