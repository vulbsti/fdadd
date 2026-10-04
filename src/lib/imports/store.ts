/**
 * Server-side import records. Every function takes an owner scope that the
 * route resolved from the signed-in user, and every query filters by it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readArchive, ArchiveError } from './archive';
import { parseExport, PARSER_VERSION } from './parsers';
import { importFilePath, renderImportFiles, type RenderableItem } from './render';
import { speakersOf, type ImportedItem, type ImportedMessage, type ImportProvider } from './types';
import { decodeImportBody, encodeImportBody, importBodies, importBodyPrefix, inBatches, orphanedImportBodies } from './bodies';

export const IMPORT_BUCKET = 'person-imports';
export interface OwnerScope { userId: string; personId: string }

export class ImportError extends Error {
  constructor(public code: 'not_found' | 'invalid_state' | 'unsupported_import' | 'too_large' | 'internal', message: string) { super(message); }
}

function fail(what: string, error: { code?: string } | null) {
  return new ImportError('internal', `${what} failed (${error?.code ?? 'database'}).`);
}

export interface ImportSummary {
  id: string; provider: ImportProvider; status: string; fileName: string | null; format: string | null;
  warnings: string[]; error: string | null; createdAt: string; importedAt: string | null;
  itemCount: number;
}

const IMPORT_COLUMNS = 'id,provider,status,file_name,detected_format,warnings,error,created_at,imported_at,person_speaker,upload_path';

function summary(row: Record<string, unknown>, itemCount: number): ImportSummary {
  return {
    id: String(row.id), provider: row.provider as ImportProvider, status: String(row.status), fileName: (row.file_name as string) ?? null,
    format: (row.detected_format as string) ?? null, warnings: (row.warnings as string[]) ?? [], error: (row.error as string) ?? null,
    createdAt: String(row.created_at), importedAt: (row.imported_at as string) ?? null, itemCount,
  };
}

async function ownedImport(admin: SupabaseClient, scope: OwnerScope, importId: string) {
  const result = await admin.from('person_imports').select(IMPORT_COLUMNS)
    .eq('id', importId).eq('user_id', scope.userId).eq('profile_id', scope.personId).maybeSingle();
  if (result.error) throw fail('Import read', result.error);
  if (!result.data) throw new ImportError('not_found', 'Import was not found.');
  return result.data as Record<string, unknown>;
}

export async function listImports(admin: SupabaseClient, scope: OwnerScope) {
  const imports = await admin.from('person_imports').select(IMPORT_COLUMNS)
    .eq('user_id', scope.userId).eq('profile_id', scope.personId).order('created_at', { ascending: false }).limit(200);
  if (imports.error) throw fail('Import list', imports.error);
  const counts = new Map<string, number>();
  const ids = (imports.data ?? []).map((row) => String(row.id));
  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      const items = await admin.from('person_import_items').select('import_id').eq('user_id', scope.userId).in('import_id', ids).range(offset, offset + 999);
      if (items.error) throw fail('Import item count', items.error);
      for (const row of items.data ?? []) counts.set(String(row.import_id), (counts.get(String(row.import_id)) ?? 0) + 1);
      if ((items.data?.length ?? 0) < 1000) break;
    }
  }
  return (imports.data ?? []).map((row) => summary(row, counts.get(String(row.id)) ?? 0));
}

export async function createImport(admin: SupabaseClient, scope: OwnerScope, input: { provider: ImportProvider; fileName: string | null; status: 'uploading' | 'awaiting_review' }) {
  const inserted = await admin.from('person_imports').insert({
    user_id: scope.userId, profile_id: scope.personId, provider: input.provider, status: input.status,
    file_name: input.fileName?.slice(0, 300) ?? null, parser_version: PARSER_VERSION,
  }).select('id').single();
  if (inserted.error) throw fail('Import creation', inserted.error);
  return String(inserted.data.id);
}

/** A browser uploads straight to private storage; the function body limit never applies. */
export async function createUploadTarget(admin: SupabaseClient, scope: OwnerScope, importId: string) {
  const path = `${scope.userId}/${scope.personId}/${importId}/upload.zip`;
  const signed = await admin.storage.from(IMPORT_BUCKET).createSignedUploadUrl(path);
  if (signed.error) throw new ImportError('internal', 'Could not prepare the upload.');
  const updated = await admin.from('person_imports').update({ upload_path: path, updated_at: new Date().toISOString() })
    .eq('id', importId).eq('user_id', scope.userId);
  if (updated.error) throw fail('Import update', updated.error);
  return { path, token: signed.data.token };
}

function messageCount(messages: ImportedMessage[]) {
  return { total: messages.length, own: messages.filter((message) => message.role === 'user').length };
}

/** Insert parsed items as pending, marking which are already imported for this person. */
export async function addPendingItems(admin: SupabaseClient, scope: OwnerScope, importId: string, provider: ImportProvider, items: ImportedItem[]) {
  const existing = new Map<string, { message_count: number; ended_at: string | null; body_digest: string | null }>();
  const externalIds = items.map((item) => item.externalId);
  for (let index = 0; index < externalIds.length; index += 200) {
    const rows = await admin.from('person_import_items').select('external_id,message_count,ended_at,body,body_digest')
      .eq('user_id', scope.userId).eq('profile_id', scope.personId).eq('provider', provider).eq('status', 'imported')
      .in('external_id', externalIds.slice(index, index + 200));
    if (rows.error) throw fail('Duplicate check', rows.error);
    for (const row of rows.data ?? []) {
      existing.set(String(row.external_id), { message_count: Number(row.message_count), ended_at: row.ended_at as string | null,
        body_digest: (row.body_digest as string | null) ?? (typeof row.body === 'string' ? createHash('sha256').update(row.body).digest('hex') : null) });
    }
  }
  // With an object store, the body is written there first; the row then
  // carries only its address, and is never saved without its body.
  const bodies = importBodies();
  const stored = new Map<string, string>();
  if (bodies) {
    await inBatches(items, 8, async (item) => {
      const { key, bytes } = encodeImportBody(scope, importId, { messages: item.messages, body: item.body });
      await bodies.put(key, bytes, 'application/json');
      stored.set(item.externalId, key);
    });
  }
  const rows = items.map((item) => {
    const count = messageCount(item.messages);
    const prior = existing.get(item.externalId);
    const bodyDigest = item.body ? createHash('sha256').update(item.body).digest('hex') : null;
    const unchanged = prior && prior.message_count === count.total && prior.body_digest === bodyDigest
      && (prior.ended_at ? new Date(prior.ended_at).getTime() : null) === (item.endedAt ? new Date(item.endedAt).getTime() : null);
    return {
      import_id: importId, user_id: scope.userId, profile_id: scope.personId, provider, kind: item.kind,
      external_id: item.externalId.slice(0, 300), title: item.title, started_at: item.startedAt, ended_at: item.endedAt,
      message_count: count.total, person_message_count: count.own, speakers: speakersOf(item),
      messages: bodies ? [] : item.messages, body: bodies ? null : item.body,
      body_object: stored.get(item.externalId) ?? null, body_digest: bodyDigest,
      source_url: item.sourceUrl, duplicate_state: !prior ? 'new' : unchanged ? 'unchanged' : 'updated',
    };
  });
  // Batches by size so one request never carries an unbounded payload.
  let batch: typeof rows = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const inserted = await admin.from('person_import_items').upsert(batch, { onConflict: 'import_id,external_id' });
    if (inserted.error) throw fail('Import item save', inserted.error);
    batch = [];
    bytes = 0;
  };
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (bytes + size > 3_000_000) await flush();
    batch.push(row);
    bytes += size;
  }
  await flush();
  return rows.length;
}

export async function parseUploadedImport(admin: SupabaseClient, scope: OwnerScope, importId: string) {
  const row = await ownedImport(admin, scope, importId);
  if (row.status !== 'uploading' || typeof row.upload_path !== 'string') throw new ImportError('invalid_state', 'This import has already been read.');
  const path = row.upload_path;
  const setFailed = async (message: string) => {
    await admin.from('person_imports').update({ status: 'failed', error: message.slice(0, 2000), updated_at: new Date().toISOString() }).eq('id', importId).eq('user_id', scope.userId);
  };
  try {
    const download = await admin.storage.from(IMPORT_BUCKET).download(path);
    if (download.error) throw new ImportError('not_found', 'The upload did not arrive. Try again.');
    const files = readArchive(new Uint8Array(await download.data.arrayBuffer()));
    const parsed = parseExport(files, row.provider as ImportProvider);
    if (!parsed.items.length) {
      throw new ImportError('unsupported_import', parsed.warnings[0] ?? 'No conversations were found in this file. Check that it is the export described on the card.');
    }
    await addPendingItems(admin, scope, importId, parsed.provider, parsed.items);
    const updated = await admin.from('person_imports').update({
      status: 'awaiting_review', provider: parsed.provider, detected_format: parsed.format, warnings: parsed.warnings.slice(0, 50),
      parser_version: PARSER_VERSION, updated_at: new Date().toISOString(),
    }).eq('id', importId).eq('user_id', scope.userId);
    if (updated.error) throw fail('Import update', updated.error);
  } catch (error) {
    const message = error instanceof ImportError || error instanceof ArchiveError ? error.message : 'The file could not be read.';
    await setFailed(message);
    if (error instanceof ArchiveError) throw new ImportError('too_large', error.message);
    throw error instanceof ImportError ? error : new ImportError('unsupported_import', message);
  } finally {
    // The parsed items are the record; the raw export is not kept.
    await admin.storage.from(IMPORT_BUCKET).remove([path]);
    await admin.from('person_imports').update({ upload_path: null }).eq('id', importId).eq('user_id', scope.userId);
  }
}

export interface PreviewItem {
  id: string; kind: 'conversation' | 'document'; title: string; startedAt: string | null; endedAt: string | null;
  messageCount: number; personMessageCount: number; speakers: string[]; duplicateState: 'new' | 'updated' | 'unchanged'; status: string;
}

export async function importDetail(admin: SupabaseClient, scope: OwnerScope, importId: string) {
  const row = await ownedImport(admin, scope, importId);
  const items: PreviewItem[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await admin.from('person_import_items')
      .select('id,kind,title,started_at,ended_at,message_count,person_message_count,speakers,duplicate_state,status')
      .eq('import_id', importId).eq('user_id', scope.userId).order('started_at', { ascending: false, nullsFirst: false }).order('id').range(offset, offset + 999);
    if (page.error) throw fail('Import items read', page.error);
    for (const item of page.data ?? []) {
      items.push({ id: String(item.id), kind: item.kind, title: String(item.title), startedAt: item.started_at, endedAt: item.ended_at,
        messageCount: Number(item.message_count), personMessageCount: Number(item.person_message_count), speakers: item.speakers ?? [],
        duplicateState: item.duplicate_state, status: String(item.status) });
    }
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const speakers = [...new Set(items.flatMap((item) => item.speakers))].sort();
  return { import: summary(row, items.length), personSpeaker: (row.person_speaker as string) ?? null, speakers, items };
}

export async function confirmImport(admin: SupabaseClient, scope: OwnerScope, importId: string, itemIds: string[], personSpeaker: string | null) {
  await ownedImport(admin, scope, importId);
  const result = await admin.rpc('confirm_person_import', { p_user_id: scope.userId, p_import_id: importId, p_item_ids: itemIds, p_person_speaker: personSpeaker });
  if (result.error?.code === 'IMP02') throw new ImportError('invalid_state', 'This import was already confirmed.');
  if (result.error?.code === 'IMP01') throw new ImportError('not_found', 'Import was not found.');
  if (result.error) throw fail('Import confirmation', result.error);
  await sweepImportBodies(admin, scope);
  return result.data as { importId: string; imported: number };
}

/** Removes the import and every item it brought in; the next workspace no longer has them. */
export async function deleteImport(admin: SupabaseClient, scope: OwnerScope, importId: string) {
  const row = await ownedImport(admin, scope, importId);
  if (typeof row.upload_path === 'string') await admin.storage.from(IMPORT_BUCKET).remove([row.upload_path]);
  const removed = await admin.from('person_imports').delete().eq('id', importId).eq('user_id', scope.userId).eq('profile_id', scope.personId);
  if (removed.error) throw fail('Import removal', removed.error);
  await sweepImportBodies(admin, scope);
}

/**
 * Remove stored bodies no row names any more (items left unselected at
 * confirmation, replaced by a newer copy, or deleted with their import).
 * Bodies of an import that is still being read or reviewed are left alone:
 * they are stored before their rows exist. Best effort: a leftover costs
 * storage and is collected by the next sweep.
 */
export async function sweepImportBodies(admin: SupabaseClient, scope: OwnerScope) {
  const bodies = importBodies();
  if (!bodies) return 0;
  try {
    const stored = await bodies.list(importBodyPrefix(scope));
    if (!stored.length) return 0;
    const referenced: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await admin.from('person_import_items').select('body_object').eq('user_id', scope.userId).eq('profile_id', scope.personId)
        .not('body_object', 'is', null).order('id').range(offset, offset + 999);
      if (page.error) throw fail('Import body read', page.error);
      referenced.push(...(page.data ?? []).map((row) => String(row.body_object)));
      if ((page.data?.length ?? 0) < 1000) break;
    }
    const open = await admin.from('person_imports').select('id').eq('user_id', scope.userId).eq('profile_id', scope.personId)
      .in('status', ['uploading', 'awaiting_review']);
    if (open.error) throw fail('Imports read', open.error);
    const inProgress = new Set((open.data ?? []).map((row) => String(row.id)));
    const prefix = importBodyPrefix(scope);
    const orphans = orphanedImportBodies(stored.filter((key) => !inProgress.has(key.slice(prefix.length).split('/')[0])), referenced);
    if (orphans.length) await bodies.remove(orphans);
    return orphans.length;
  } catch (error) {
    console.error('[imports] stored bodies were not swept', { personId: scope.personId, message: error instanceof Error ? error.message : 'unknown' });
    return 0;
  }
}

// --- Workspace --------------------------------------------------------------

/** Cheap fingerprint of what is imported, so an unchanged imports/ folder is not rewritten every turn. */
export async function importedSignature(admin: SupabaseClient, scope: OwnerScope) {
  const hash = createHash('sha256');
  let count = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await admin.from('person_import_items').select('id').eq('user_id', scope.userId).eq('profile_id', scope.personId)
      .eq('status', 'imported').order('id').range(offset, offset + 999);
    if (page.error) throw fail('Imported items read', page.error);
    for (const row of page.data ?? []) hash.update(`${row.id}\n`);
    count += page.data?.length ?? 0;
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const speakers = await admin.from('person_imports').select('id,person_speaker').eq('user_id', scope.userId).eq('profile_id', scope.personId)
    .eq('status', 'imported').order('id');
  if (speakers.error) throw fail('Imports read', speakers.error);
  for (const row of speakers.data ?? []) hash.update(`${row.id}:${row.person_speaker ?? ''}\n`);
  return { count, signature: `${count}-${hash.digest('hex').slice(0, 24)}` };
}

/** A workspace is never built with an imported item silently missing its content. */
async function readImportBody(key: string) {
  const bytes = await importBodies()?.get(key);
  if (!bytes) throw new ImportError('internal', 'An imported item\'s stored content is unavailable.');
  return decodeImportBody(bytes);
}

export async function loadImportFiles(admin: SupabaseClient, scope: OwnerScope) {
  const imports = await admin.from('person_imports').select('id,person_speaker').eq('user_id', scope.userId).eq('profile_id', scope.personId).eq('status', 'imported');
  if (imports.error) throw fail('Imports read', imports.error);
  const speakerByImport = new Map((imports.data ?? []).map((row) => [String(row.id), (row.person_speaker as string) ?? null]));
  const items: RenderableItem[] = [];
  // Small pages: a single conversation can be large.
  for (let offset = 0; ; offset += 50) {
    const page = await admin.from('person_import_items').select('id,import_id,provider,kind,title,started_at,ended_at,messages,body,body_object,source_url')
      .eq('user_id', scope.userId).eq('profile_id', scope.personId).eq('status', 'imported').order('id').range(offset, offset + 49);
    if (page.error) throw fail('Imported items read', page.error);
    items.push(...await inBatches(page.data ?? [], 8, async (row): Promise<RenderableItem> => {
      // Rows saved before the object store keep their body inline.
      const content = row.body_object ? await readImportBody(String(row.body_object))
        : { messages: (row.messages ?? []) as ImportedMessage[], body: (row.body as string | null) ?? null };
      return { id: String(row.id), provider: row.provider as ImportProvider, kind: row.kind, title: String(row.title),
        startedAt: row.started_at ?? null, endedAt: row.ended_at ?? null, messages: content.messages,
        body: content.body, sourceUrl: row.source_url ?? null, personSpeaker: speakerByImport.get(String(row.import_id)) ?? null };
    }));
    if ((page.data?.length ?? 0) < 50) break;
  }
  return renderImportFiles(items);
}

export { importFilePath };
