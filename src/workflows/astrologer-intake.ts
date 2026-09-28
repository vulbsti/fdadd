/**
 * Durable birth-setup workflow: every deterministic calculation the agent
 * reads later (chart, sensitivity, lifetime dasha timeline, monthly transits),
 * stored per birth revision, then frozen-profile finalization.
 *
 * Inputs contain only the internal `astro_agent_runs.id` — never cookies,
 * user JWTs, Supabase secrets, birth payloads, or person-map data. Every
 * database/model/Atros/side-effect boundary is a separate `'use step'`.
 */
import { FatalError, getWorkflowMetadata } from 'workflow';
import { calculate, loadProfileBirth, storeProfileCalculations } from '@/lib/astro/profile-calculations';
import { TimelineSchema, TransitSnapshotSchema } from '@/lib/astro/calculations';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore } from '@/lib/astro/agent-store';
import { ensureAtrosReady } from '@/lib/astro/atros-commands';
import { getErrorMessage, isMissingAtrosAssetError } from '@/lib/astro/workflow-errors';

const INTAKE_GREETING =
  'Your chart is ready. Tell me what is on your mind, or ask about any period of your life, and I will read it against what you share with me.';

async function claimIntakeExecution(runId: string) {
  'use step';
  const { workflowRunId } = getWorkflowMetadata();
  const admin = createAdminClient();
  return new AgentStore(admin, admin).claimRunExecution(runId, workflowRunId);
}

/** Load the pending intake run and the birth data frozen on its profile. */
async function loadIntakeRun(runId: string) {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(runId);
  if (run.kind !== 'intake') {
    throw new FatalError(`run ${runId} is not an intake run`);
  }
  const profile = await store.getProfile(run.profile_id);
  if (!profile) throw new FatalError(`profile ${run.profile_id} not found`);
  return {
    runId: run.id,
    profileId: run.profile_id,
    sessionId: run.session_id,
    userId: run.user_id,
  };
}

/**
 * Every calculation for the profile's current birth revision, stored in one
 * step so large results (the lifetime timeline) never pass through Workflow
 * state. Returns only the small frozen chart copies for finalization.
 */
async function calculateAndStore(input: { profileId: string; userId: string }) {
  'use step';
  try {
    const admin = createAdminClient();
    const profile = await loadProfileBirth(admin, input.profileId, input.userId);
    const [chart, sensitivity, timeline, transits] = await Promise.all(
      (['chart', 'sensitivity', 'timeline', 'transits'] as const).map((kind) => calculate(kind, profile.birth)));
    await storeProfileCalculations(admin, profile, {
      chart: chart as Record<string, unknown>, sensitivity: sensitivity as Record<string, unknown>,
      timeline: TimelineSchema.parse(timeline), transits: z.array(TransitSnapshotSchema).parse(transits),
    });
    return { chart, sensitivity };
  } catch (error) {
    if (isMissingAtrosAssetError(error)) throw new FatalError(getErrorMessage(error, 'birth calculations failed'));
    throw error;
  }
}

/** Install/warm Atros before chart and sensitivity branches share the sandbox. */
async function prepareAtros(): Promise<void> {
  'use step';
  try {
    await ensureAtrosReady();
  } catch (error) {
    const message = getErrorMessage(error, 'Atros setup failed');
    if (isMissingAtrosAssetError(error)) throw new FatalError(message);
    throw error;
  }
}

/** Freeze chart/sensitivity, mark ready, insert greeting, complete run/session. */
async function finalizeIntake(input: {
  runId: string;
  chart: unknown;
  sensitivity: unknown;
}): Promise<{ status: string }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const outcome = await store.workerFinishIntake({
    runId: input.runId,
    chart: input.chart,
    sensitivity: input.sensitivity,
    greeting: INTAKE_GREETING,
  });
  return { status: outcome.status };
}

/** Record a durable intake failure on profile/run/session. */
async function failIntake(input: { runId: string; message: string }): Promise<void> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  await store.workerFailIntake({
    runId: input.runId,
    errorCode: 'intake_failed',
    errorMessage: input.message.slice(0, 500),
  });
}

/**
 * One intake workflow run per `begin_astro_profile_intake`. Completed
 * calculations resume through Workflow replay/cache on refresh or retry;
 * duplicate intake request IDs return the same profile/session/run.
 */
export async function astrologerIntakeWorkflow(runId: string) {
  'use workflow';

  const execution = await claimIntakeExecution(runId);
  if (!execution.won) return { status: 'duplicate' as const, workflowRunId: execution.workflowRunId };
  const intake = await loadIntakeRun(runId);

  try {
    await prepareAtros();
    const frozen = await calculateAndStore({ profileId: intake.profileId, userId: intake.userId });
    await finalizeIntake({ runId: intake.runId, chart: frozen.chart, sensitivity: frozen.sensitivity });
  } catch (error) {
    const message = getErrorMessage(error, 'intake failed');
    console.error('[astrologer-intake] failed', { runId: intake.runId, message });
    await failIntake({ runId: intake.runId, message });
    return { status: 'failed' as const, error: message };
  }

  return { status: 'complete' as const };
}
