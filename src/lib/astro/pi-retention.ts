import type { SupabaseClient } from '@supabase/supabase-js';
import { piObjects } from './pi-objects';

/**
 * Daily retention for Pi checkpoint archives.
 *
 * Every final checkpoint carries the whole Pi session so far, so a chat only
 * needs its newest one: a cold workspace restores from the latest complete run
 * (pi-runtime.ts). Older finals are deleted once a later kept checkpoint of the
 * same chat, under the same privacy, mode and birth settings, contains them,
 * and only when the run's answer is stored in astro_messages. Archives of
 * failed runs are kept for a week so a resume can still use them.
 */

export interface RetentionCheckpoint {
  runId: string;
  sequence: number;
  objectPath: string;
  final: boolean;
  epochs: string;
  sessionId: string;
  kind: string;
  status: string;
  finishedAt: string;
  answerStored: boolean;
}

const FAILED_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function planCheckpointRetention(rows: RetentionCheckpoint[], now = Date.now()) {
  const remove: RetentionCheckpoint[] = [];
  const bySession = new Map<string, RetentionCheckpoint[]>();
  for (const row of rows) {
    if (row.kind !== 'question') continue;
    if (row.status === 'failed') {
      if (now - Date.parse(row.finishedAt) > FAILED_RUN_RETENTION_MS) remove.push(row);
      continue;
    }
    if (!row.final || (row.status !== 'complete' && row.status !== 'waiting_for_user')) continue;
    bySession.set(row.sessionId, [...(bySession.get(row.sessionId) ?? []), row]);
  }
  for (const finished of bySession.values()) {
    finished.sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
    // Restore reads the latest complete run; the latest finished one is the newest transcript.
    const kept = new Set([finished.findLast((row) => row.status === 'complete'), finished.at(-1)].filter(Boolean));
    for (const [index, row] of finished.entries()) {
      if (kept.has(row) || !row.answerStored) continue;
      const covered = finished.slice(index + 1).some((later) => kept.has(later) && later.epochs === row.epochs);
      if (covered) remove.push(row);
    }
  }
  return remove;
}

type Joined = {
  run_id: string; sequence: number; object_path: string; final: boolean;
  mode_epoch: number; privacy_epoch: number; birth_revision: number;
  astro_agent_runs: { session_id: string; kind: string; status: string; completed_at: string | null; updated_at: string; output_message_id: string | null } | null;
};

export async function sweepPiCheckpointRetention(admin: SupabaseClient, { max = 200 } = {}) {
  const receipts = await admin.from('pi_workspace_checkpoints')
    .select('run_id,sequence,object_path,final,mode_epoch,privacy_epoch,birth_revision,astro_agent_runs(session_id,kind,status,completed_at,updated_at,output_message_id)')
    .limit(5000);
  if (receipts.error) throw new Error(`Cannot read Pi checkpoint receipts (${receipts.error.code}).`);
  const joined = (receipts.data ?? []) as unknown as Joined[];
  const outputIds = [...new Set(joined.map((row) => row.astro_agent_runs?.output_message_id).filter((id): id is string => Boolean(id)))];
  const stored = new Set<string>();
  for (let index = 0; index < outputIds.length; index += 200) {
    const messages = await admin.from('astro_messages').select('id').in('id', outputIds.slice(index, index + 200));
    if (messages.error) throw new Error(`Cannot confirm stored chat messages (${messages.error.code}).`);
    for (const message of messages.data ?? []) stored.add(String(message.id));
  }
  const rows: RetentionCheckpoint[] = joined.flatMap((row) => row.astro_agent_runs ? [{
    runId: row.run_id, sequence: Number(row.sequence), objectPath: row.object_path, final: row.final,
    epochs: `${row.mode_epoch}:${row.privacy_epoch}:${row.birth_revision}`,
    sessionId: row.astro_agent_runs.session_id, kind: row.astro_agent_runs.kind, status: row.astro_agent_runs.status,
    finishedAt: row.astro_agent_runs.completed_at ?? row.astro_agent_runs.updated_at,
    answerStored: Boolean(row.astro_agent_runs.output_message_id && stored.has(row.astro_agent_runs.output_message_id)),
  }] : []);
  const doomed = planCheckpointRetention(rows).slice(0, max);
  if (!doomed.length) return { checkpoints: 0 };
  // Objects first: a receipt without its archive would break a restore, an
  // archive without a receipt is only unreferenced bytes.
  const keptPaths = new Set(rows.filter((row) => !doomed.includes(row)).map((row) => row.objectPath));
  await piObjects().remove([...new Set(doomed.map((row) => row.objectPath).filter((path) => !keptPaths.has(path)))]);
  for (const row of doomed) {
    const deleted = await admin.from('pi_workspace_checkpoints').delete().eq('run_id', row.runId).eq('sequence', row.sequence);
    if (deleted.error) throw new Error(`Cannot remove a Pi checkpoint receipt (${deleted.error.code}).`);
  }
  // Live events of failed runs are never published, so they are cleared with the archive.
  const failedRuns = [...new Set(doomed.filter((row) => row.status === 'failed').map((row) => row.runId))];
  if (failedRuns.length) {
    const events = await admin.from('pi_run_events').delete().in('run_id', failedRuns);
    if (events.error) throw new Error(`Cannot clear failed-run events (${events.error.code}).`);
  }
  return { checkpoints: doomed.length };
}
