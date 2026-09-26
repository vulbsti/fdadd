import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPiFiles } from './pi-store';
import type { PiAuthority } from './pi-authority';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  admin: null as SupabaseClient | null,
  tables: {} as Record<string, Row[]>,
  calls: [] as Array<{ table: string; columns: string; filters: Array<[string, unknown]> }>,
  run: {} as Row,
  profile: {} as Row,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }));
vi.mock('./agent-store', () => ({ AgentStore: class {
  async getRun() { return state.run; }
  async getProfile() { return state.profile; }
} }));

const authority: PiAuthority = {
  runId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000002',
  personId: '30000000-0000-4000-8000-000000000003', sessionId: '40000000-0000-4000-8000-000000000004',
  modeEpoch: 2, privacyEpoch: 3, birthRevision: 4, astrologyEnabled: false, expiresAt: Date.now() + 60_000,
};
const owned = (row: Row) => ({ user_id: authority.userId, profile_id: authority.personId, ...row });

function query(table: string) {
  const call = { table, columns: '*', filters: [] as Array<[string, unknown]> };
  state.calls.push(call);
  const rows = () => (state.tables[table] ?? [])
    .filter((row) => call.filters.every(([key, value]) => row[key] === value))
    .map((row) => call.columns === '*' ? { ...row }
      : Object.fromEntries(call.columns.split(',').map((key) => [key, row[key]])));
  const builder = {
    select(columns: string) { call.columns = columns; return builder; },
    eq(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
    order() { return builder; },
    async range(from: number, to: number) { return { data: rows().slice(from, to + 1), error: null }; },
    async single() {
      const selected = rows();
      return selected.length === 1 ? { data: selected[0], error: null }
        : { data: null, error: { code: 'PGRST116' } };
    },
  };
  return builder;
}

beforeEach(() => {
  state.calls = [];
  state.admin = { from: query } as unknown as SupabaseClient;
  state.run = { id: authority.runId, user_id: authority.userId, profile_id: authority.personId,
    session_id: authority.sessionId, status: 'active' };
  state.profile = { id: authority.personId, user_id: authority.userId, name: 'Synthetic Person', birth_date: null };
  state.tables = {
    person_preferences: [owned({ astrology_enabled: false, mode_epoch: 2 })],
    person_model_heads: [owned({ privacy_epoch: 3, current_revision: 5, processed_source_seq: 8 })],
    astro_profiles: [{ id: authority.personId, user_id: authority.userId, birth_revision: 4 }],
    person_model_revisions: [owned({ revision_no: 5, brief: 'Source-backed brief.', mode_epoch: 2, privacy_epoch: 3 })],
    person_revision_objects: [owned({ revision_no: 5, object_id: 'object-a', object_version_id: 'version-a' }),
      owned({ revision_no: 5, object_id: 'object-b', object_version_id: 'version-b' })],
    person_objects: [owned({ id: 'object-a', kind: 'goal', lifecycle: 'retired' }),
      owned({ id: 'object-b', kind: 'pattern', lifecycle: 'active' })],
    person_object_versions: [owned({ id: 'version-a', object_id: 'object-a', epistemic_class: 'reported', lifecycle: 'active', typed_payload: { title: 'Ask for help' } }),
      owned({ id: 'version-b', object_id: 'object-b', epistemic_class: 'working_hypothesis', lifecycle: 'active', typed_payload: { title: 'Delay asking' } })],
    person_object_version_support: [owned({ id: 'support-a', object_version_id: 'version-a', source_item_id: 'source-a', relation: 'supports' })],
    person_revision_relations: [owned({ revision_no: 5, relation_id: 'relation-a', relation_version_id: 'relation-version-a' })],
    person_relations: [owned({ id: 'relation-a', relation_kind: 'qualifies', from_object_id: 'object-a', to_object_id: 'object-b' })],
    person_relation_versions: [owned({ id: 'relation-version-a', relation_id: 'relation-a', epistemic_class: 'working_hypothesis', lifecycle: 'active', typed_payload: { note: 'A qualified connection' } })],
    person_source_items: [owned({ id: 'source-a', source_seq: 8, source_kind: 'native_message', source_message_id: 'message-a', inclusion_status: 'included', speaker_role: 'user' })],
    astro_messages: [{ id: 'message-a', user_id: authority.userId, role: 'user', content: 'I want to ask Priya for help.' }],
    person_changes: [],
  };
});

describe('Pi owner-scoped graph and source hydration', () => {
  it('includes stable object kinds and relation endpoints while preserving accepted version identity', async () => {
    const { files } = await loadPiFiles(authority);
    const object = JSON.parse(files.find((file) => file.path === 'person/structured/objects/object-a.json')!.content);
    expect(object).toMatchObject({ id: 'version-a', object_id: 'object-a', kind: 'goal', lifecycle: 'active',
      support: [expect.objectContaining({ source_item_id: 'source-a' })] });
    const relation = JSON.parse(files.find((file) => file.path === 'person/structured/relations/relation-a.json')!.content);
    expect(relation).toMatchObject({ id: 'relation-version-a', relation_id: 'relation-a', relation_kind: 'qualifies',
      from_object_id: 'object-a', to_object_id: 'object-b', epistemic_class: 'working_hypothesis' });
    expect(files.find((file) => file.path === 'person/theory-of-mind.md')!.content).toContain('"kind": "goal"');
    for (const call of state.calls.filter((call) => ['person_objects', 'person_relations', 'person_object_versions', 'person_relation_versions'].includes(call.table))) {
      expect(call.filters).toEqual(expect.arrayContaining([['user_id', authority.userId], ['profile_id', authority.personId]]));
    }
  });

  it.each(['person_objects', 'person_relations'])('refuses missing or foreign stable metadata from %s', async (table) => {
    state.tables[table] = state.tables[table].map((row) => ({ ...row, user_id: 'another-owner' }));
    await expect(loadPiFiles(authority)).rejects.toThrow('identity or version is missing');
  });

  it.each([['person_object_versions', 'object_id'], ['person_relation_versions', 'relation_id']])(
    'requires %s to belong to the exact revision member', async (table, key) => {
      state.tables[table][0] = { ...state.tables[table][0], [key]: 'another-identity' };
      await expect(loadPiFiles(authority)).rejects.toThrow('identity or version is missing');
    },
  );

  it('hydrates import-backed user text when it has a real owner-scoped message', async () => {
    state.tables.person_source_items[0].source_kind = 'import_item';
    const { files } = await loadPiFiles(authority);
    expect(files.find((file) => file.path === 'person/sources/source-a.md')!.content).toContain('I want to ask Priya for help.');
  });

  it('fails explicitly for included import evidence with no supported original-body contract', async () => {
    state.tables.person_source_items[0] = { ...state.tables.person_source_items[0], source_kind: 'import_item', source_message_id: null,
      lineage: { importedText: 'Not a verified source-body contract.' } };
    await expect(loadPiFiles(authority)).rejects.toThrow('no owner-scoped message or typed change request');
  });

  it('hydrates immutable typed-change requests without inventing a chat message', async () => {
    state.tables.person_source_items[0] = { ...state.tables.person_source_items[0], source_kind: 'explicit_correction', source_message_id: null };
    state.tables.person_changes = [owned({ id: 'change-a', source_item_id: 'source-a', request: { kind: 'correct_account', payload: { correction: 'It was 2025, not 2024.' } } })];
    const { files } = await loadPiFiles(authority);
    expect(files.find((file) => file.path === 'person/sources/source-a.md')!.content).toContain('It was 2025, not 2024.');
  });

  it('does not hydrate excluded, assistant, or foreign-owner source bodies', async () => {
    state.tables.person_source_items = [
      { ...state.tables.person_source_items[0], inclusion_status: 'excluded', source_message_id: null },
      owned({ id: 'assistant-source', inclusion_status: 'included', speaker_role: 'assistant' }),
      { ...state.tables.person_source_items[0], id: 'foreign-source', user_id: 'another-owner' },
    ];
    const { files } = await loadPiFiles(authority);
    expect(files.some((file) => file.path.startsWith('person/sources/'))).toBe(false);
  });
});
