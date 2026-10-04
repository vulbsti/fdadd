import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore, type RunRow } from './agent-store';
import { PiAuthoritySchema, piArtifactPrefix, type PiAuthority } from './pi-authority';
import { assertPiAuthority, clearPiRunEvents, PiQuestionSchema, queuePiMemoryProposals, readPiCheckpoint, resolvePiCheckpointFiles, type PiCheckpoint } from './pi-store';
import { removePiRunTransfers } from './pi-transfer';

type PublicationRun = Pick<RunRow, 'id' | 'user_id' | 'profile_id' | 'session_id' | 'status' | 'version' | 'output_message_id'>;
type FinalReceipt = { status: string; refs: Record<string, unknown> };

export interface PiPublishDependencies {
  getRun(runId: string): Promise<PublicationRun>;
  getFinalReceipt(authority: PiAuthority): Promise<FinalReceipt | null>;
  assertAuthority(authority: PiAuthority): Promise<unknown>;
  readCheckpoint(authority: PiAuthority): Promise<PiCheckpoint | null>;
  finish(args: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  /** Queue proposals/ files as reviewable memory candidates after publication. */
  queueProposals?(authority: PiAuthority, checkpoint: PiCheckpoint): Promise<unknown>;
  /** Remove what only a running answer needs: live event rows and staged transfer pieces. */
  clearScratch?(authority: PiAuthority): Promise<unknown>;
}

function dependencies(): PiPublishDependencies {
  const admin = createAdminClient();
  const store = new AgentStore(admin, admin);
  return {
    getRun: (runId) => store.getRun(runId),
    async getFinalReceipt(authority) {
      // Query the exact final receipt; the public trace's page limit is irrelevant.
      const result = await admin.from('astro_agent_run_steps').select('status,refs')
        .eq('run_id', authority.runId).eq('user_id', authority.userId)
        .eq('profile_id', authority.personId).eq('session_id', authority.sessionId)
        .eq('step_key', 'pi:final').eq('kind', 'checkpoint').maybeSingle();
      if (result.error) throw new Error('Could not verify the published Pi receipt.');
      return result.data as FinalReceipt | null;
    },
    assertAuthority: assertPiAuthority,
    readCheckpoint: readPiCheckpoint,
    finish: async (args) => {
      const result = await admin.rpc('worker_finish_pi_run', args);
      return { error: result.error };
    },
    async queueProposals(authority, checkpoint) {
      const proposals = checkpoint.files.filter((file) => file.path.startsWith('proposals/'));
      return queuePiMemoryProposals(authority, await resolvePiCheckpointFiles(authority, { files: proposals }));
    },
    clearScratch: (authority) => Promise.all([clearPiRunEvents(authority), removePiRunTransfers(authority)]),
  };
}

async function clearScratchBestEffort(authority: PiAuthority, deps: PiPublishDependencies) {
  try {
    await deps.clearScratch?.(authority);
  } catch (error) {
    // The answer is already published; leftovers cost storage, not correctness.
    console.error('[pi-publish] run scratch was not cleared', { runId: authority.runId, message: error instanceof Error ? error.message : 'unknown' });
  }
}

async function queueProposalsBestEffort(authority: PiAuthority, checkpoint: PiCheckpoint, deps: PiPublishDependencies) {
  try {
    await deps.queueProposals?.(authority, checkpoint);
  } catch (error) {
    // The answer is already published; a proposal is a candidate, not part of it.
    console.error('[pi-publish] memory proposals were not queued', { runId: authority.runId, message: error instanceof Error ? error.message : 'unknown' });
  }
}

function assertRunScope(run: PublicationRun, authority: PiAuthority) {
  if (run.id !== authority.runId || run.user_id !== authority.userId
    || run.profile_id !== authority.personId || run.session_id !== authority.sessionId) {
    throw new Error('Pi publication authority does not own this run.');
  }
}

type Published = 'complete' | 'waiting_for_user';

async function completedPublication(authority: PiAuthority, deps: PiPublishDependencies): Promise<Published | null> {
  const run = await deps.getRun(authority.runId);
  assertRunScope(run, authority);
  if (run.status !== 'complete' && run.status !== 'waiting_for_user') return null;
  const receipt = await deps.getFinalReceipt(authority);
  const refs = receipt?.refs;
  if (!run.output_message_id || receipt?.status !== 'succeeded' || refs?.runtime !== 'pi'
    || refs.artifactPrefix !== piArtifactPrefix(authority)
    || refs.modeEpoch !== authority.modeEpoch || refs.privacyEpoch !== authority.privacyEpoch
    || refs.birthRevision !== authority.birthRevision) {
    throw new Error('Completed run does not have a matching published Pi receipt.');
  }
  return run.status as Published;
}

/** A lost Workflow acknowledgment can replay an already committed publication. */
export async function publishPiAnswer(input: PiAuthority, provided?: PiPublishDependencies) {
  const authority = PiAuthoritySchema.parse(input);
  const deps = provided ?? dependencies();
  const done = await completedPublication(authority, deps);
  if (done) return { status: done };

  try {
    await deps.assertAuthority(authority);
  } catch (error) {
    // A competing publication may commit between our first read and this fence.
    const done = await completedPublication(authority, deps);
    if (done) return { status: done };
    throw error;
  }
  const checkpoint = await deps.readCheckpoint(authority);
  const answer = checkpoint?.answer?.content?.filter((part) => part.type === 'text')
    .map((part) => part.text ?? '').join('\n').trim();
  if (!checkpoint?.final || !answer) throw new Error('No completed Pi answer artifact to publish.');
  const run = await deps.getRun(authority.runId);
  assertRunScope(run, authority);
  const args = {
    p_run_id: authority.runId, p_expected_version: run.version,
    p_mode_epoch: authority.modeEpoch, p_privacy_epoch: authority.privacyEpoch,
    p_birth_revision: authority.birthRevision, p_answer: answer,
    p_focused_question: checkpoint.question ? PiQuestionSchema.parse(checkpoint.question) : null,
    p_refs: { runtime: 'pi', artifactPrefix: piArtifactPrefix(authority), modeEpoch: authority.modeEpoch,
      privacyEpoch: authority.privacyEpoch, birthRevision: authority.birthRevision },
  };
  let result: Awaited<ReturnType<PiPublishDependencies['finish']>>;
  try {
    result = await deps.finish(args);
  } catch (error) {
    const done = await completedPublication(authority, deps);
    if (done) return { status: done };
    throw error;
  }
  if (result.error) {
    // The RPC's transaction may have succeeded before transport/step reporting
    // failed, or another worker may have published the same authority first.
    const done = await completedPublication(authority, deps);
    if (done) return { status: done };
    throw new Error(`Pi publication failed (${result.error.code ?? 'database'}).`);
  }
  await queueProposalsBestEffort(authority, checkpoint, deps);
  await clearScratchBestEffort(authority, deps);
  return { status: (checkpoint.question ? 'waiting_for_user' : 'complete') as Published };
}
