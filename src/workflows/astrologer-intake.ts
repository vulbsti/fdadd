/**
 * Durable intake workflow: chart + sensitivity calculation and frozen-profile
 * finalization for a new person.
 *
 * Inputs contain only the internal `astro_agent_runs.id` — never cookies,
 * user JWTs, Supabase secrets, birth payloads, or person-map data. Every
 * database/model/Atros/side-effect boundary is a separate `'use step'`.
 */
import { FatalError } from 'workflow';
import { atrosChart, atrosSensitivity } from '@/lib/astro/tools';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore } from '@/lib/astro/agent-store';

const INTAKE_GREETING =
  'Your chart is calculated and frozen. Ask me about timing, transits, or the patterns shaping this period — or tell me a life event with its date so I can test it against your dasha chain.';

interface FrozenCalculation {
  profileId: string;
  kind: 'chart' | 'sensitivity';
  result: unknown;
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
    birth: {
      name: profile.name as string,
      date: profile.birth_date as string,
      time: profile.birth_time as string,
      latitude: profile.lat as number,
      longitude: profile.lng as number,
      timezone: profile.tz as string,
      place_name: (profile.place_name as string | null) ?? undefined,
    },
  };
}

/** One frozen Atros calculation. Independent steps run via Promise.all. */
async function calculateFrozen(input: {
  runId: string;
  profileId: string;
  sessionId: string;
  userId: string;
  kind: 'chart' | 'sensitivity';
  birth: { name: string; date: string; time: string; latitude: number; longitude: number; timezone: string; place_name?: string };
}): Promise<FrozenCalculation> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(input.runId);

  const outcome =
    input.kind === 'chart'
      ? await atrosChart(createAdminClient(), input.userId, input.sessionId, input.profileId)
      : await atrosSensitivity(createAdminClient(), input.userId, input.sessionId, input.profileId);

  if (!outcome.ok) {
    throw new Error(`atros ${input.kind} failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  void run;
  return { profileId: input.profileId, kind: input.kind, result: outcome.data };
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

  const intake = await loadIntakeRun(runId);

  let chart: FrozenCalculation;
  let sensitivity: FrozenCalculation;
  try {
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
    const message = error instanceof Error ? error.message : 'intake failed';
    await failIntake({ runId: intake.runId, message });
    return { status: 'failed' as const, error: message };
  }

  return { status: 'complete' as const };
}
