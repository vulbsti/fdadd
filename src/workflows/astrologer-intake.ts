/**
 * Durable intake workflow: chart + sensitivity calculation and frozen-profile
 * finalization for a new person.
 *
 * Inputs contain only the internal `astro_agent_runs.id` — never cookies,
 * user JWTs, Supabase secrets, birth payloads, or person-map data. Every
 * database/model/Atros/side-effect boundary is a separate `'use step'`.
 */
import { FatalError, getWorkflowMetadata } from 'workflow';
import { atrosChart, atrosSensitivity } from '@/lib/astro/tools';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore } from '@/lib/astro/agent-store';
import { ensureAtrosReady } from '@/lib/astro/atros-commands';
import { getErrorMessage, isMissingAtrosAssetError } from '@/lib/astro/workflow-errors';

const INTAKE_GREETING =
  'Your chart is calculated and frozen. Ask me about timing, transits, or the patterns shaping this period — or tell me a life event with its date so I can test it against your dasha chain.';

interface FrozenCalculation {
  profileId: string;
  kind: 'chart' | 'sensitivity';
  result: unknown;
}

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

/** One frozen Atros calculation. Independent steps run via Promise.all. */
async function calculateFrozen(input: {
  runId: string;
  profileId: string;
  sessionId: string;
  userId: string;
  kind: 'chart' | 'sensitivity';
}): Promise<FrozenCalculation> {
  'use step';

  const outcome =
    input.kind === 'chart'
      ? await atrosChart(createAdminClient(), input.userId, input.sessionId, input.profileId)
      : await atrosSensitivity(createAdminClient(), input.userId, input.sessionId, input.profileId);

  if (!outcome.ok) {
    const error = new Error(`atros ${input.kind} failed: ${outcome.error.code} ${outcome.error.message}`);
    if (isMissingAtrosAssetError(error)) throw new FatalError(error.message);
    throw error;
  }
  return { profileId: input.profileId, kind: input.kind, result: outcome.data };
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

  let chart: FrozenCalculation;
  let sensitivity: FrozenCalculation;
  try {
    await prepareAtros();
    [chart, sensitivity] = await Promise.all([
      calculateFrozen({ ...intake, kind: 'chart' }),
      calculateFrozen({ ...intake, kind: 'sensitivity' }),
    ]);
    await finalizeIntake({
      runId: intake.runId,
      chart: chart.result,
      sensitivity: sensitivity.result,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'intake failed');
    console.error('[astrologer-intake] failed', { runId: intake.runId, message });
    await failIntake({ runId: intake.runId, message });
    return { status: 'failed' as const, error: message };
  }

  return { status: 'complete' as const };
}
