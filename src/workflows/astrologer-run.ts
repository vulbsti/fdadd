/**
 * Durable astrologer run workflow: one Workflow run per user message, executed
 * by the per-person Pi workspace runtime.
 *
 * A run never waits months for another message: it finishes as
 * `waiting_for_user`, `complete`, or `failed`; the next user message starts
 * a new Workflow linked by `resume_from_run_id`. Workflow inputs contain
 * only the internal `astro_agent_runs.id`. Every external boundary is a
 * durable `'use step'` so Workflow replay returns prior committed state
 * instead of duplicating effects.
 */

import { getWorkflowMetadata, getWritable } from 'workflow';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore, type RunRow } from '@/lib/astro/agent-store';
import { ProviderError } from '@/lib/ai/provider';
import type { AgentErrorCode, AstrologerRunEvent } from '@/lib/astro/contracts';
import { getErrorMessage } from '@/lib/astro/workflow-errors';
import { preparePiWorkspace, startPiWorkspace, pollPiWorkspace, recordPiTiming, readPiRunnerTiming, attachRunnerTiming } from '@/lib/astro/pi-runtime';
import { publishPiAnswer } from '@/lib/astro/pi-publish';
import { personRunModeFailure } from '@/lib/astro/run-mode';
import type { PiAuthority } from '@/lib/astro/pi-authority';

// ---------------------------------------------------------------------------
// Durable steps
// ---------------------------------------------------------------------------

/** Durable failure: failed run with resumable flag and next action. */
async function failRun(input: {
  runId: string;
  expectedVersion: number;
  errorCode: string;
  errorMessage: string;
  resumable: boolean;
  nextAction?: string | null;
}): Promise<void> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  await store.workerFailRun(input);
}

type RunEventChunk = { type: AstrologerRunEvent['event']; payload: AstrologerRunEvent };
type RunEventSink = (event: AstrologerRunEvent) => Promise<void>;

/** Workflow functions may obtain a stream, but only steps may write to it. */
async function emitRunEvent(event: AstrologerRunEvent): Promise<void> {
  'use step';
  const writer = getWritable<RunEventChunk>().getWriter();
  try {
    await writer.write({ type: event.event, payload: event });
  } finally {
    writer.releaseLock();
  }
}

function safeFailure(error: unknown): {
  code: AgentErrorCode;
  message: string;
  resumable: boolean;
} {
  const modeFailure = personRunModeFailure(error);
  if (modeFailure) {
    return {
      code: modeFailure.code,
      message: modeFailure.message,
      resumable: true,
    };
  }
  const raw = getErrorMessage(error, 'The astrologer run failed.');
  const providerFailure =
    error instanceof ProviderError ||
    /(?:provider|opencode|openrouter|api key|request failed with status)/i.test(raw);
  return {
    code: 'internal',
    message: providerFailure
      ? 'The astrologer model could not complete this run. You can resume it after the provider request is corrected.'
      : raw.slice(0, 300),
    resumable: true,
  };
}

function safeAgentErrorCode(value: string | null | undefined): AgentErrorCode {
  return value === 'not_found' ||
    value === 'forbidden' ||
    value === 'conflict' ||
    value === 'stale_version' ||
    value === 'quota_exceeded' ||
    value === 'invalid_transition' ||
    value === 'invalid_request' ||
    value === 'unconfigured' ||
    value === 'internal'
    ? value
    : 'internal';
}

async function loadCurrentRun(runId: string): Promise<RunRow | null> {
  'use step';
  try {
    return await new AgentStore(createAdminClient(), createAdminClient()).getRun(runId);
  } catch {
    return null;
  }
}

/**
 * The first durable step fences duplicate Workflow starts. It uses the actual
 * Workflow run ID supplied by the runtime, so even a dispatcher that crashes
 * after `start()` but before attaching can register itself on replay.
 */
async function claimRunExecution(runId: string) {
  'use step';
  const { workflowRunId } = getWorkflowMetadata();
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const execution = await store.claimRunExecution(runId, workflowRunId);
  // Each step is a durable round trip, so the opening events ride on this one.
  if (execution.won) {
    const writer = getWritable<RunEventChunk>().getWriter();
    try {
      await writer.write({ type: 'run.started', payload: { event: 'run.started', runId, phase: 'planning', status: 'active', summary: 'run started' } });
      await writer.write({ type: 'phase.changed', payload: { event: 'phase.changed', runId, phase: 'analysis', status: 'active', summary: 'Opening your isolated Pi workspace' } });
    } finally {
      writer.releaseLock();
    }
  }
  return execution;
}

/**
 * Durable wrapper around the Pi workspace body. Every external boundary is a
 * step, while this stream mirrors Pi lifecycle events without exposing hidden
 * reasoning.
 */
export async function astrologerRunWorkflow(runId: string) {
  'use workflow';

  const emit: RunEventSink = emitRunEvent;

  try {
    const execution = await claimRunExecution(runId);
    if (!execution.won) {
      return {
        status: 'duplicate' as const,
        workflowRunId: execution.workflowRunId,
      };
    }
    const result = await piWorkspaceWorkflowBody(runId, emit);
    // The Pi body either publishes a complete answer or throws; failures are
    // persisted and streamed by the catch block below.
    await emit({ event: 'run.completed', runId, status: result.status });
    return result;
  } catch (error) {
    const failure = safeFailure(error);
    console.error('[astrologer-run] failed', { runId, message: getErrorMessage(error) });

    const current = await loadCurrentRun(runId);
    if (current?.status === 'active' || current?.status === 'waiting_for_user') {
      try {
        await failRun({
          runId,
          expectedVersion: current.version,
          errorCode: failure.code,
          errorMessage: failure.message,
          resumable: failure.resumable,
          nextAction: 'Correct the provider or tool issue, then resume this run.',
        });
      } catch (persistError) {
        console.error('[astrologer-run] could not persist failure', {
          runId,
          message: getErrorMessage(persistError),
        });
      }
    }

    const failed = await loadCurrentRun(runId);
    await emit({
      event: 'run.failed',
      runId,
      status: 'failed',
      error: {
        code: failed?.error_code ? safeAgentErrorCode(failed.error_code) : failure.code,
        message: failed?.error_message?.slice(0, 300) ?? failure.message,
        resumable: failed?.resumable ?? failure.resumable,
      },
    });
    return { status: 'failed' as const, errorCode: failure.code };
  }
}

/**
 * Prepare the workspace and start its runner in one durable step. A retry is
 * safe: preparation of a prepared VM returns at once, and the runner start is
 * guarded by a kernel lock and the final-checkpoint check.
 */
async function preparePiStep(runId: string) {
  'use step';
  const prepared = await preparePiWorkspace(runId);
  // Recorded before the runner starts, so nothing else is checkpointing the run.
  await recordPiTiming(runId, 'prepared', prepared.timings);
  await startPiWorkspace(prepared);
  return prepared;
}

/** How long one poll step keeps forwarding live events before handing back to the workflow. */
const POLL_STEP_MS = 20_000;
const POLL_INTERVAL_MS = 800;

async function pollPiStep(input: Awaited<ReturnType<typeof preparePiWorkspace>>, cursor: number, sawText: boolean) {
  'use step';
  const writer = getWritable<RunEventChunk>().getWriter();
  const write = async (event: AstrologerRunEvent) => { await writer.write({ type: event.event, payload: event }); };
  try {
    // Every step and workflow sleep is a durable round trip of a second or
    // more, so one short read per step made streamed text arrive in bursts.
    // Stream writes reach readers at once; stay here and read often instead.
    // A retry of this step re-sends rows from `cursor`; readers skip by seq.
    // A killed runner cannot report its exit, so each step checks the VM once.
    const until = Date.now() + POLL_STEP_MS;
    let progress = await pollPiWorkspace(input, cursor, write, { probeSandbox: true, sawText });
    while (!progress.done && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      progress = await pollPiWorkspace(input, progress.cursor, write, { sawText: progress.sawText });
    }
    return progress;
  } finally {
    writer.releaseLock();
  }
}

async function publishPiStep(authority: PiAuthority) {
  'use step';
  return publishPiAnswer(authority);
}

/** Runs after the answer is out, so it never delays it. */
async function recordRunnerTimingStep(input: Awaited<ReturnType<typeof preparePiWorkspace>>) {
  'use step';
  const runner = await readPiRunnerTiming(input);
  if (runner) await attachRunnerTiming(input.authority.runId, runner);
}

async function piWorkspaceWorkflowBody(runId: string, emit: RunEventSink) {
  const prepared = await preparePiStep(runId);
  // Each poll step reads live events for a while itself. The per-person VM
  // is left running for the next message and expires when idle.
  let cursor = 0;
  let sawText = false;
  for (;;) {
    const progress = await pollPiStep(prepared, cursor, sawText);
    cursor = progress.cursor;
    sawText = progress.sawText;
    if (progress.done) break;
  }
  const result = await publishPiStep(prepared.authority);
  await emit({ event: 'answer.ready', runId, phase: 'responding', summary: 'Answer and workspace saved' });
  await recordRunnerTimingStep(prepared);
  return result;
}
