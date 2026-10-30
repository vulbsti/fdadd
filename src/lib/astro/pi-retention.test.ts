import { describe, expect, it } from 'vitest';
import { planCheckpointRetention, type RetentionCheckpoint } from './pi-retention';

const now = Date.parse('2026-10-30T00:00:00Z');
const row = (runId: string, finishedAt: string, extra: Partial<RetentionCheckpoint> = {}): RetentionCheckpoint => ({
  runId, sequence: 3, objectPath: `u/p/${runId}/d.json`, final: true, epochs: '1:1:1', sessionId: 's1', kind: 'question',
  status: 'complete', finishedAt, answerStored: true, ...extra,
});
const ids = (rows: RetentionCheckpoint[]) => rows.map((item) => item.runId).sort();

describe('planCheckpointRetention', () => {
  it('keeps only the newest checkpoint of a chat once its answers are stored', () => {
    const rows = [row('a', '2026-10-01T00:00:00Z'), row('b', '2026-10-02T00:00:00Z'), row('c', '2026-10-03T00:00:00Z')];
    expect(ids(planCheckpointRetention(rows, now))).toEqual(['a', 'b']);
  });

  it('keeps the latest complete run that restores read, even after a later follow-up question', () => {
    const rows = [row('a', '2026-10-01T00:00:00Z'), row('b', '2026-10-02T00:00:00Z'),
      row('c', '2026-10-03T00:00:00Z', { status: 'waiting_for_user' })];
    expect(ids(planCheckpointRetention(rows, now))).toEqual(['a']);
  });

  it('never deletes a run whose answer is not stored', () => {
    const rows = [row('a', '2026-10-01T00:00:00Z', { answerStored: false }), row('b', '2026-10-02T00:00:00Z')];
    expect(planCheckpointRetention(rows, now)).toEqual([]);
  });

  it('keeps transcripts from before a privacy, mode or birth change', () => {
    const rows = [row('a', '2026-10-01T00:00:00Z', { epochs: '1:1:1' }), row('b', '2026-10-02T00:00:00Z', { epochs: '1:2:1' })];
    expect(planCheckpointRetention(rows, now)).toEqual([]);
  });

  it('treats each chat separately and ignores other run kinds and active runs', () => {
    const rows = [row('a', '2026-10-01T00:00:00Z', { sessionId: 's1' }), row('b', '2026-10-02T00:00:00Z', { sessionId: 's2' }),
      row('c', '2026-10-01T00:00:00Z', { kind: 'reflection' }), row('d', '2026-10-01T00:00:00Z', { status: 'active', final: false })];
    expect(planCheckpointRetention(rows, now)).toEqual([]);
  });

  it('drops failed-run archives after a week so a prompt resume still works', () => {
    const rows = [row('old', '2026-10-20T00:00:00Z', { status: 'failed', final: false }),
      row('recent', '2026-10-28T00:00:00Z', { status: 'failed', final: false })];
    expect(ids(planCheckpointRetention(rows, now))).toEqual(['old']);
  });
});
