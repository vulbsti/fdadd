import { describe, expect, it, vi } from 'vitest';
import { publishPiAnswer, type PiPublishDependencies } from './pi-publish';
import { piArtifactPrefix, type PiAuthority } from './pi-authority';

const authority: PiAuthority = {
  runId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000002',
  personId: '30000000-0000-4000-8000-000000000003', sessionId: '40000000-0000-4000-8000-000000000004',
  modeEpoch: 4, privacyEpoch: 5, birthRevision: 6, astrologyEnabled: true, expiresAt: 1,
};
const run = { id: authority.runId, user_id: authority.userId, profile_id: authority.personId,
  session_id: authority.sessionId, status: 'active' as const, version: 8, output_message_id: null };
const completed = { ...run, status: 'complete' as const, output_message_id: '50000000-0000-4000-8000-000000000005' };
const receipt = { status: 'succeeded', refs: { runtime: 'pi', artifactPrefix: piArtifactPrefix(authority),
  modeEpoch: authority.modeEpoch, privacyEpoch: authority.privacyEpoch, birthRevision: authority.birthRevision } };

function dependencies() {
  return {
    getRun: vi.fn<PiPublishDependencies['getRun']>().mockResolvedValue(run),
    getFinalReceipt: vi.fn<PiPublishDependencies['getFinalReceipt']>().mockResolvedValue(receipt),
    assertAuthority: vi.fn<PiPublishDependencies['assertAuthority']>().mockResolvedValue(authority),
    readCheckpoint: vi.fn<PiPublishDependencies['readCheckpoint']>().mockResolvedValue({
      sequence: 2, final: true, session: '', files: [], events: [],
      answer: { content: [{ type: 'text', text: 'Saved answer.' }], stopReason: 'stop' },
    }),
    finish: vi.fn<PiPublishDependencies['finish']>().mockResolvedValue({ error: null }),
  };
}

describe('Pi answer publication replay', () => {
  it('recognizes a committed matching publication without requiring an active run or VM', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValue(completed);
    await expect(publishPiAnswer(authority, deps)).resolves.toEqual({ status: 'complete' });
    expect(deps.assertAuthority).not.toHaveBeenCalled();
    expect(deps.readCheckpoint).not.toHaveBeenCalled();
    expect(deps.finish).not.toHaveBeenCalled();
  });

  it.each(['artifactPrefix', 'modeEpoch', 'privacyEpoch', 'birthRevision', 'runtime'] as const)(
    'rejects a completed receipt with mismatched %s', async (field) => {
      const deps = dependencies();
      deps.getRun.mockResolvedValue(completed);
      deps.getFinalReceipt.mockResolvedValue({ ...receipt, refs: { ...receipt.refs, [field]: 'wrong' } });
      await expect(publishPiAnswer(authority, deps)).rejects.toThrow('matching published Pi receipt');
      expect(deps.finish).not.toHaveBeenCalled();
    },
  );

  it('rejects completion without its durable answer or successful Pi receipt', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValue({ ...completed, output_message_id: null });
    await expect(publishPiAnswer(authority, deps)).rejects.toThrow('matching published Pi receipt');
    deps.getRun.mockResolvedValue(completed);
    deps.getFinalReceipt.mockResolvedValue(null);
    await expect(publishPiAnswer(authority, deps)).rejects.toThrow('matching published Pi receipt');
  });

  it('rejects another owner or session even when it is completed', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValue({ ...completed, session_id: authority.personId });
    await expect(publishPiAnswer(authority, deps)).rejects.toThrow('does not own this run');
  });

  it('publishes active work using the exact migration argument contract', async () => {
    const deps = dependencies();
    await expect(publishPiAnswer(authority, deps)).resolves.toEqual({ status: 'complete' });
    expect(deps.finish).toHaveBeenCalledWith({
      p_run_id: authority.runId, p_expected_version: run.version, p_mode_epoch: authority.modeEpoch,
      p_privacy_epoch: authority.privacyEpoch, p_birth_revision: authority.birthRevision,
      p_answer: 'Saved answer.', p_refs: receipt.refs,
    });
  });

  it('accepts a matching commit racing the active authority check', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValueOnce(run).mockResolvedValue(completed);
    deps.assertAuthority.mockRejectedValue(new Error('not active'));
    await expect(publishPiAnswer(authority, deps)).resolves.toEqual({ status: 'complete' });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  it('accepts a matching commit after an RPC response failure', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValueOnce(run).mockResolvedValueOnce(run).mockResolvedValue(completed);
    deps.finish.mockResolvedValue({ error: { code: 'AIT01' } });
    await expect(publishPiAnswer(authority, deps)).resolves.toEqual({ status: 'complete' });
  });

  it('accepts a matching commit when the RPC transport throws', async () => {
    const deps = dependencies();
    deps.getRun.mockResolvedValueOnce(run).mockResolvedValueOnce(run).mockResolvedValue(completed);
    deps.finish.mockRejectedValue(new Error('connection lost'));
    await expect(publishPiAnswer(authority, deps)).resolves.toEqual({ status: 'complete' });
  });

  it('preserves a genuine stale authority failure', async () => {
    const deps = dependencies();
    deps.assertAuthority.mockRejectedValue(new Error('settings changed'));
    await expect(publishPiAnswer(authority, deps)).rejects.toThrow('settings changed');
    expect(deps.finish).not.toHaveBeenCalled();
  });
});
