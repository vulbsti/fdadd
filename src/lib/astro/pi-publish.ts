import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore, type RunRow } from './agent-store';
import { PiAuthoritySchema, piArtifactPrefix, type PiAuthority } from './pi-authority';
import { assertPiAuthority, readPiCheckpoint, type PiCheckpoint } from './pi-store';

type PublicationRun = Pick<RunRow, 'id' | 'user_id' | 'profile_id' | 'session_id' | 'status' | 'version' | 'output_message_id'>;
type FinalReceipt = { status: string; refs: Record<string, unknown> };

export interface PiPublishDependencies {
  getRun(runId: string): Promise<PublicationRun>;
  getFinalReceipt(authority: PiAuthority): Promise<FinalReceipt | null>;
  assertAuthority(authority: PiAuthority): Promise<unknown>;
  readCheckpoint(authority: PiAuthority): Promise<PiCheckpoint | null>;
  finish(args: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
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
  };
}

function assertRunScope(run: PublicationRun, authority: PiAuthority) {
  if (run.id !== authority.runId || run.user_id !== authority.userId
    || run.profile_id !== authority.personId || run.session_id !== authority.sessionId) {
    throw new Error('Pi publication authority does not own this run.');
  }
}

async function completedPublication(authority: PiAuthority, deps: PiPublishDependencies): Promise<boolean> {
  const run = await deps.getRun(authority.runId);
  assertRunScope(run, authority);
  if (run.status !== 'complete') return false;
  const receipt = await deps.getFinalReceipt(authority);
  const refs = receipt?.refs;
  if (!run.output_message_id || receipt?.status !== 'succeeded' || refs?.runtime !== 'pi'
    || refs.artifactPrefix !== piArtifactPrefix(authority)
    || refs.modeEpoch !== authority.modeEpoch || refs.privacyEpoch !== authority.privacyEpoch
    || refs.birthRevision !== authority.birthRevision) {
    throw new Error('Completed run does not have a matching published Pi receipt.');
  }
  return true;
}

/** A lost Workflow acknowledgment can replay an already committed publication. */
export async function publishPiAnswer(input: PiAuthority, provided?: PiPublishDependencies) {
  const authority = PiAuthoritySchema.parse(input);
  const deps = provided ?? dependencies();
  if (await completedPublication(authority, deps)) return { status: 'complete' as const };

  try {
    await deps.assertAuthority(authority);
  } catch (error) {
    // A competing publication may commit between our first read and this fence.
    if (await completedPublication(authority, deps)) return { status: 'complete' as const };
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
    p_refs: { runtime: 'pi', artifactPrefix: piArtifactPrefix(authority), modeEpoch: authority.modeEpoch,
      privacyEpoch: authority.privacyEpoch, birthRevision: authority.birthRevision },
  };
  let result: Awaited<ReturnType<PiPublishDependencies['finish']>>;
  try {
    result = await deps.finish(args);
  } catch (error) {
    if (await completedPublication(authority, deps)) return { status: 'complete' as const };
    throw error;
  }
  if (result.error) {
    // The RPC's transaction may have succeeded before transport/step reporting
    // failed, or another worker may have published the same authority first.
    if (await completedPublication(authority, deps)) return { status: 'complete' as const };
    throw new Error(`Pi publication failed (${result.error.code ?? 'database'}).`);
  }
  return { status: 'complete' as const };
}
