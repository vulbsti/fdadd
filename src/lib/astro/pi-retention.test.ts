import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPiRunEvents, prunePiCheckpoints } from './pi-store';
import { removePiRunTransfers, removePiTransfer } from './pi-transfer';
import { piArtifactPrefix, type PiAuthority } from './pi-authority';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ admin: null as SupabaseClient | null, tables: {} as Record<string, Row[]>, objects: new Set<string>() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }));

const authority: PiAuthority = {
  runId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000002',
  personId: '30000000-0000-4000-8000-000000000003', sessionId: '40000000-0000-4000-8000-000000000004',
  modeEpoch: 2, privacyEpoch: 3, birthRevision: 4, astrologyEnabled: true, expiresAt: Date.now() + 60_000,
};
const otherRun = '10000000-0000-4000-8000-0000000000ff';
const prefix = piArtifactPrefix(authority);
const digest = (letter: string) => letter.repeat(64);
const receipt = (sequence: number, letter: string, runId = authority.runId): Row => ({ run_id: runId, sequence,
  user_id: authority.userId, profile_id: authority.personId, object_path: `${prefix}/${digest(letter)}.json` });

/** Just enough of the table and Storage clients for delete/list/remove. */
function table(name: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let remove = false;
  const builder = {
    select() { return builder; },
    delete() { remove = true; return builder; },
    eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
    lt(key: string, value: number) { filters.push((row) => Number(row[key]) < value); return builder; },
    then(resolve: (value: { data: Row[]; error: null }) => unknown) {
      const matched = (state.tables[name] ?? []).filter((row) => filters.every((filter) => filter(row)));
      if (remove) state.tables[name] = (state.tables[name] ?? []).filter((row) => !matched.includes(row));
      return Promise.resolve({ data: matched, error: null }).then(resolve);
    },
  };
  return builder;
}
const bucket = {
  async remove(paths: string[]) { for (const path of paths) state.objects.delete(path); return { data: [], error: null }; },
  async list(folder: string) {
    const names = new Set([...state.objects].filter((path) => path.startsWith(`${folder}/`)).map((path) => path.slice(folder.length + 1).split('/')[0]));
    return { data: [...names].map((name) => ({ name })), error: null };
  },
};

beforeEach(() => {
  state.admin = { from: table, storage: { from: () => bucket } } as unknown as SupabaseClient;
  state.tables = {};
  state.objects = new Set();
});

describe('Pi checkpoint retention', () => {
  it('keeps only the newest checkpoint of a run and leaves other runs alone', async () => {
    state.tables.pi_workspace_checkpoints = [receipt(1, 'a'), receipt(2, 'b'), receipt(3, 'c'), receipt(1, 'd', otherRun)];
    state.objects = new Set(['a', 'b', 'c', 'd'].map((letter) => `${prefix}/${digest(letter)}.json`));
    await expect(prunePiCheckpoints(authority, 3, `${prefix}/${digest('c')}.json`)).resolves.toBe(2);
    expect([...state.objects].sort()).toEqual([`${prefix}/${digest('c')}.json`, `${prefix}/${digest('d')}.json`]);
    expect(state.tables.pi_workspace_checkpoints.map((row) => [row.run_id, row.sequence])).toEqual([[authority.runId, 3], [otherRun, 1]]);
  });

  it('never removes the archive the kept receipt names when an older receipt shares its bytes', async () => {
    state.tables.pi_workspace_checkpoints = [receipt(1, 'a'), receipt(2, 'a')];
    state.objects = new Set([`${prefix}/${digest('a')}.json`]);
    await prunePiCheckpoints(authority, 2, `${prefix}/${digest('a')}.json`);
    expect(state.objects.has(`${prefix}/${digest('a')}.json`)).toBe(true);
    expect(state.tables.pi_workspace_checkpoints).toHaveLength(1);
  });

  it('does nothing for the first checkpoint', async () => {
    state.tables.pi_workspace_checkpoints = [receipt(1, 'a')];
    await expect(prunePiCheckpoints(authority, 1, `${prefix}/${digest('a')}.json`)).resolves.toBe(0);
    expect(state.tables.pi_workspace_checkpoints).toHaveLength(1);
  });
});

describe('Pi staged transfer cleanup', () => {
  const staged = (letter: string, parts: number) => [`${prefix}/transfer/${digest(letter)}/manifest.json`,
    ...Array.from({ length: parts }, (_, index) => `${prefix}/transfer/${digest(letter)}/${index}`)];

  it('removes the manifest and every piece of one committed transfer', async () => {
    state.objects = new Set([...staged('a', 3), ...staged('b', 1), `${prefix}/${digest('a')}.json`]);
    await removePiTransfer(authority, { digest: digest('a'), byteLength: 2 * 1024 * 1024 + 1, parts: 3 });
    expect([...state.objects].sort()).toEqual([...staged('b', 1), `${prefix}/${digest('a')}.json`].sort());
  });

  it('sweeps every staged transfer of a run without touching its checkpoint or blobs', async () => {
    const kept = [`${prefix}/${digest('c')}.json`, `${authority.userId}/${authority.personId}/blobs/${digest('e')}`];
    state.objects = new Set([...staged('a', 2), ...staged('b', 1), ...kept]);
    await expect(removePiRunTransfers(authority)).resolves.toBe(5);
    expect([...state.objects].sort()).toEqual(kept.sort());
  });
});

describe('Pi live event cleanup', () => {
  it('clears the rows of the published run only', async () => {
    state.tables.pi_run_events = [1, 2].map((seq) => ({ run_id: authority.runId, seq, user_id: authority.userId, profile_id: authority.personId }));
    state.tables.pi_run_events.push({ run_id: otherRun, seq: 1, user_id: authority.userId, profile_id: authority.personId });
    await clearPiRunEvents(authority);
    expect(state.tables.pi_run_events.map((row) => row.run_id)).toEqual([otherRun]);
  });
});
