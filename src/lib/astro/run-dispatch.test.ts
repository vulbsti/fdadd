import { describe, expect, it, vi } from 'vitest';
import type { DispatchClaim, DispatchCompletion, DispatchRelease } from './agent-store';
import { sweepAstrologerDispatches, type DispatchDependencies } from './run-dispatch';

function claim(attempt = 1): DispatchClaim {
  return {
    runId: '10000000-0000-4000-8000-000000000001',
    leaseToken: '20000000-0000-4000-8000-000000000002',
    attempt,
    maxAttempts: 5,
  };
}

function dependencies(input: {
  completion?: DispatchCompletion;
  release?: DispatchRelease;
  startError?: Error;
  attempt?: number;
}) {
  const dispatch = claim(input.attempt);
  const cancel = vi.fn(async () => undefined);
  const store = {
    claimRunDispatch: vi.fn()
      .mockResolvedValueOnce(dispatch)
      .mockResolvedValueOnce(null),
    completeRunDispatch: vi.fn(async () => input.completion ?? {
      won: true,
      workflowRunId: 'wrun_winner',
      fenced: false,
    }),
    releaseRunDispatch: vi.fn(async () => input.release ?? {
      released: true,
      fenced: false,
      dead: false,
    }),
  } satisfies DispatchDependencies['store'];
  const startWorkflow = vi.fn(async () => {
    if (input.startError) throw input.startError;
    return { runId: 'wrun_winner', cancel };
  });
  return { store, startWorkflow, cancel, dispatch };
}

describe('sweepAstrologerDispatches', () => {
  it('starts and completes a claimed dispatch', async () => {
    const deps = dependencies({});

    const result = await sweepAstrologerDispatches({ max: 1 }, deps);

    expect(result).toEqual({ claimed: 1, started: 1, deduplicated: 0, released: 0, dead: 0 });
    expect(deps.store.completeRunDispatch).toHaveBeenCalledWith(
      deps.dispatch.runId,
      deps.dispatch.leaseToken,
      'wrun_winner',
    );
    expect(deps.cancel).not.toHaveBeenCalled();
  });

  it('cancels a started workflow when the fence names another winner', async () => {
    const deps = dependencies({
      completion: { won: false, workflowRunId: 'wrun_other', fenced: true },
    });

    const result = await sweepAstrologerDispatches({ max: 1 }, deps);

    expect(result.deduplicated).toBe(1);
    expect(deps.cancel).toHaveBeenCalledOnce();
    expect(deps.store.releaseRunDispatch).not.toHaveBeenCalled();
  });

  it('releases a failed start with bounded exponential backoff', async () => {
    const deps = dependencies({ startError: new Error('queue unavailable'), attempt: 3 });

    const result = await sweepAstrologerDispatches({ max: 1 }, deps);

    expect(result).toEqual({ claimed: 1, started: 0, deduplicated: 0, released: 1, dead: 0 });
    expect(deps.store.releaseRunDispatch).toHaveBeenCalledWith(
      deps.dispatch.runId,
      deps.dispatch.leaseToken,
      'queue unavailable',
      20,
    );
  });

  it('reports the terminal retry boundary returned by the database', async () => {
    const deps = dependencies({
      startError: new Error('queue unavailable'),
      attempt: 5,
      release: { released: true, fenced: false, dead: true },
    });

    const result = await sweepAstrologerDispatches({ max: 1 }, deps);

    expect(result.released).toBe(1);
    expect(result.dead).toBe(1);
  });
});
