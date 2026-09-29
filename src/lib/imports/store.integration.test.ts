/**
 * Against a local Supabase stack:
 *   IMPORTS_DB_INTEGRATION=1 node scripts/with-local-supabase-env.mjs npx vitest run src/lib/imports/store.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { strToU8, zipSync } from 'fflate';
import { confirmImport, createImport, createUploadTarget, deleteImport, IMPORT_BUCKET, importDetail, importedSignature,
  listImports, loadImportFiles, parseUploadedImport, type OwnerScope } from './store';

const enabled = process.env.IMPORTS_DB_INTEGRATION === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const chatgpt = (messages: string[], id = 'conv-1') => [{
  title: 'Leaving my job', conversation_id: id, create_time: 1727000000, current_node: `n${messages.length - 1}`,
  mapping: Object.fromEntries(messages.map((text, index) => [`n${index}`, {
    id: `n${index}`, parent: index ? `n${index - 1}` : null, children: index < messages.length - 1 ? [`n${index + 1}`] : [],
    message: { author: { role: index % 2 ? 'assistant' : 'user' }, create_time: 1727000000 + index, content: { content_type: 'text', parts: [text] } },
  }])),
}];

describe.skipIf(!enabled)('import store against Supabase', () => {
  let admin: SupabaseClient;
  let scope: OwnerScope;

  async function upload(provider: 'chatgpt' | 'meta_ai', files: Record<string, string>) {
    const importId = await createImport(admin, scope, { provider, fileName: 'export.zip', status: 'uploading' });
    const target = await createUploadTarget(admin, scope, importId);
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
    const uploaded = await admin.storage.from(IMPORT_BUCKET).uploadToSignedUrl(target.path, target.token, new Blob([zip]), { contentType: 'application/zip' });
    expect(uploaded.error).toBeNull();
    await parseUploadedImport(admin, scope, importId);
    return importId;
  }

  beforeAll(async () => {
    admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const created = await admin.auth.admin.createUser({ email: `imports-${crypto.randomUUID()}@example.invalid`, password: `I-${crypto.randomUUID()}-Aa1!`, email_confirm: true });
    if (created.error || !created.data.user) throw created.error;
    const profile = await admin.from('astro_profiles').insert({
      user_id: created.data.user.id, name: 'Import person', birth_date: '1990-01-01', birth_time: '06:30', lat: 12.97, lng: 77.59,
      tz: 'Asia/Kolkata', place_name: 'Bengaluru', chart_json: {}, sensitivity_json: {}, initialization_status: 'ready',
    }).select('id').single();
    if (profile.error) throw profile.error;
    scope = { userId: created.data.user.id, personId: profile.data.id };
  });

  afterAll(async () => {
    if (scope) await admin.auth.admin.deleteUser(scope.userId);
  });

  it('parses, reviews, confirms, supersedes and removes imports', async () => {
    const first = await upload('chatgpt', { 'conversations.json': JSON.stringify(chatgpt(['Should I quit?', 'Why?'])), 'chat.html': '<html></html>' });
    const firstDetail = await importDetail(admin, scope, first);
    expect(firstDetail.import).toMatchObject({ provider: 'chatgpt', status: 'awaiting_review' });
    expect(firstDetail.items).toHaveLength(1);
    expect(firstDetail.items[0]).toMatchObject({ duplicateState: 'new', messageCount: 2, personMessageCount: 1 });
    // The raw export is deleted once read.
    const leftover = await admin.storage.from(IMPORT_BUCKET).list(`${scope.userId}/${scope.personId}/${first}`);
    expect(leftover.data ?? []).toHaveLength(0);

    await confirmImport(admin, scope, first, firstDetail.items.map((item) => item.id), null);
    const before = await importedSignature(admin, scope);
    expect(before.count).toBe(1);
    const files = await loadImportFiles(admin, scope);
    expect(files.map((file) => file.path)).toEqual([expect.stringMatching(/^imports\/chatgpt\/2024-09-22-leaving-my-job-/), 'imports/index.md']);
    expect(files[0].content).toContain('## Person');
    expect(files[0].content).toContain('Should I quit?');

    // A later export of the same conversation with more messages replaces the earlier copy.
    const second = await upload('chatgpt', { 'conversations.json': JSON.stringify([...chatgpt(['Should I quit?', 'Why?', 'Money']), ...chatgpt(['Other'], 'conv-2')]) });
    const secondDetail = await importDetail(admin, scope, second);
    expect(Object.fromEntries(secondDetail.items.map((item) => [item.title + item.messageCount, item.duplicateState])))
      .toEqual({ 'Leaving my job3': 'updated', 'Leaving my job1': 'new' });
    await confirmImport(admin, scope, second, secondDetail.items.map((item) => item.id), null);
    const imports = await listImports(admin, scope);
    expect(imports.map((item) => item.id)).toEqual([second]);
    expect((await importedSignature(admin, scope)).signature).not.toBe(before.signature);

    // Named speakers need the person to say which one is them.
    const whatsapp = await upload('meta_ai', { 'WhatsApp Chat with Meta AI.txt': '13/02/2025, 21:04 - Asha: am I stuck?\n13/02/2025, 21:05 - Meta AI: Tell me more' });
    const whatsappDetail = await importDetail(admin, scope, whatsapp);
    expect(whatsappDetail.speakers).toEqual(['Asha']);
    await confirmImport(admin, scope, whatsapp, whatsappDetail.items.map((item) => item.id), 'Asha');
    const withWhatsapp = await loadImportFiles(admin, scope);
    expect(withWhatsapp.find((file) => file.path.startsWith('imports/meta_ai/'))?.content).toContain('## Person · 2025-02-13 21:04');

    await expect(confirmImport(admin, scope, whatsapp, [], null)).rejects.toThrow('already confirmed');
    await deleteImport(admin, scope, second);
    await deleteImport(admin, scope, whatsapp);
    expect(await loadImportFiles(admin, scope)).toEqual([]);
  });

  it('marks an unreadable upload as failed', async () => {
    await expect(upload('chatgpt', { 'notes.json': '{"nothing": true}' })).rejects.toThrow();
    const imports = await listImports(admin, scope);
    expect(imports[0]).toMatchObject({ status: 'failed' });
  });
});
