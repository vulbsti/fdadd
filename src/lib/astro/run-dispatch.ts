/** Durable outbox dispatcher for question workflows. */

import { getRun, start } from 'workflow/api';
import { AgentStore } from './agent-store';
import { createAdminClient } from '@/lib/supabase/admin';
import { astrologerRunWorkflow } from '@/workflows/astrologer-run';
import { getErrorMessage } from './workflow-errors';

interface StartedWorkflow {
  runId: string;
  cancel: () => Promise<unknown>;
}

export interface DispatchDependencies {
  store?: Pick<AgentStore, 'claimRunDispatch' | 'completeRunDispatch' | 'releaseRunDispatch'>;
  startWorkflow?: (runId: string) => Promise<StartedWorkflow>;
}

export interface DispatchSweepResult {
  claimed: number;
  started: number;
  deduplicated: number;
  released: number;
  dead: number;
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(300, 5 * (2 ** Math.max(0, attempt - 1)));
}

function safeDispatchError(error: unknown): string {
  return getErrorMessage(error, 'workflow dispatch failed').slice(0, 300);
}

async function defaultStartWorkflow(runId: string): Promise<StartedWorkflow> {
  const workflow = await start(astrologerRunWorkflow, [runId]);
  return {
    runId: workflow.runId,
    cancel: () => getRun(workflow.runId).cancel(),
  };
}

/**
 * Claim and start a bounded batch. A failed external start releases the row
 * with backoff; a duplicate start is cancelled after the database fence names
 * the winner. The Workflow also self-registers as its first durable step,
 * closing the crash-after-start/before-complete gap.
 */
export async function sweepAstrologerDispatches(
  options: { runId?: string; max?: number; leaseSeconds?: number } = {},
  dependencies: DispatchDependencies = {},
): Promise<DispatchSweepResult> {
  const store = dependencies.store ?? (() => {
    const admin = createAdminClient();
    return new AgentStore(admin, admin);
  })();
  const startWorkflow = dependencies.startWorkflow ?? defaultStartWorkflow;
  const max = Math.min(Math.max(options.max ?? 10, 1), 25);
  const result: DispatchSweepResult = {
    claimed: 0,
    started: 0,
    deduplicated: 0,
    released: 0,
    dead: 0,
  };

  for (let index = 0; index < max; index++) {
    const claim = await store.claimRunDispatch(options.runId ?? null, options.leaseSeconds ?? 60);
    if (!claim) break;
    result.claimed++;

    let workflow: StartedWorkflow | null = null;
    try {
      workflow = await startWorkflow(claim.runId);
      const attached = await store.completeRunDispatch(
        claim.runId,
        claim.leaseToken,
        workflow.runId,
      );
      if (attached.won) {
        result.started++;
      } else {
        result.deduplicated++;
        await workflow.cancel().catch(() => undefined);
      }
    } catch (error) {
      if (workflow) await workflow.cancel().catch(() => undefined);
      const released = await store.releaseRunDispatch(
        claim.runId,
        claim.leaseToken,
        safeDispatchError(error),
        retryDelaySeconds(claim.attempt),
      );
      if (released.released) result.released++;
      if (released.dead) result.dead++;
    }

    // A targeted recovery never claims another run.
    if (options.runId) break;
  }

  return result;
}

/** Input acceptance must not be rolled back because Workflow start failed. */
export async function dispatchAstrologerRunBestEffort(runId: string): Promise<DispatchSweepResult | null> {
  try {
    return await sweepAstrologerDispatches({ runId, max: 1 });
  } catch (error) {
    console.error('[astrologer-dispatch] recovery remains pending', {
      runId,
      message: safeDispatchError(error),
    });
    return null;
  }
}
