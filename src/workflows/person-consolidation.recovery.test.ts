import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = {
  job: '11111111-1111-4111-8111-111111111111',
  lease: '22222222-2222-4222-8222-222222222222',
  profile: '33333333-3333-4333-8333-333333333333',
  user: '44444444-4444-4444-8444-444444444444',
  source: '55555555-5555-4555-8555-555555555555',
  object: '66666666-6666-4666-8666-666666666666',
  version: '77777777-7777-4777-8777-777777777777',
};

const unknownTime = { precision: 'unknown', start: null, end: null, age: null, note: null } as const;

type FailureStage = 'compose' | 'verify';

const mocks = vi.hoisted(() => ({
  callPersonStage: vi.fn(),
  sleep: vi.fn(async (_until: Date) => undefined),
  Store: class {
    constructor() {
      return mocks.store as object;
    }
  },
  store: undefined as object | undefined,
}));

vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  sleep: mocks.sleep,
}));

vi.mock('@/lib/person-model/consolidation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/person-model/consolidation')>('@/lib/person-model/consolidation');
  return { ...actual, callPersonStage: mocks.callPersonStage };
});

vi.mock('@/lib/person-model/consolidation-store', () => ({
  PersonConsolidationStore: mocks.Store,
}));

import { personConsolidationWorkflow } from './person-consolidation';
import { PersonLeaseLostError } from '@/lib/person-model/consolidation-errors';

interface RecoveryState {
  failureStage: FailureStage;
  failed: boolean;
  state: 'pending' | 'running' | 'published';
  fence: number;
  checkpoints: Map<string, { id: string; value: unknown; metadata: { provider: string | null; model: string | null } }>;
  stageReceipts: Array<{ stageKey: string; state: string; metrics?: Record<string, number> }>;
  sourceOutcomes: Array<{ sourceId: string; outcome: string; code?: string | null }>;
  failureReceipts: Array<{ stage: string; retryable: boolean }>;
  candidates: Array<{ id: string; value: unknown }>;
  publications: Array<{ revision: number; candidateId: string }>;
  activeRevision: number;
  activeModelVersion: string;
  availableAt: string | null;
  retryScheduled: boolean;
  loadError?: Error;
  noClaim?: boolean;
}

function makeState(failureStage: FailureStage): RecoveryState {
  return {
    failureStage,
    failed: false,
    state: 'pending',
    fence: 1,
    checkpoints: new Map(),
    stageReceipts: [],
    sourceOutcomes: [],
    failureReceipts: [],
    candidates: [],
    publications: [],
    activeRevision: 1,
    activeModelVersion: 'prior-valid-model-v1',
    availableAt: null,
    retryScheduled: true,
  };
}

function claim(state: RecoveryState) {
  return {
    jobId: ids.job,
    leaseToken: ids.lease,
    fence: state.fence,
    profileId: ids.profile,
    userId: ids.user,
    baseRevision: 1,
    privacyEpoch: 0,
    modeEpoch: 0,
    sourceFromSeq: 2,
    sourceToSeq: 2,
  };
}

function source() {
  return {
    sourceId: ids.source,
    sourceSeq: 2,
    sourceTime: '2026-09-23T10:00:00Z',
    ingestedAt: '2026-09-23T10:00:01Z',
    sourceKind: 'native_message' as const,
    speaker: 'user' as const,
    subjectKind: 'self' as const,
    subjectLabel: null,
    inclusion: 'included' as const,
    body: 'I kept learning.',
    change: null,
  };
}

function context(state: RecoveryState) {
  const existingGoal = {
    objectId: ids.object,
    versionId: ids.version,
    versionNo: 1,
    kind: 'goal',
    epistemicClass: 'reported' as const,
    lifecycle: 'active' as const,
    payload: {
      kind: 'goal' as const,
      title: 'Keep learning',
      statedOutcome: 'Keep learning',
      underlyingValue: null,
      status: 'active' as const,
      timeframe: unknownTime,
      purpose: null,
    },
    effectiveTime: unknownTime,
    sourceIds: [],
    observationIds: [],
  };
  return {
    claim: claim(state),
    sources: [source()],
    includedSources: [source()],
    countercontext: [],
    snapshot: {
      baseRevision: 1,
      privacyEpoch: 0,
      modeEpoch: 0,
      processedSourceSeq: 2,
      objectMembers: [existingGoal],
      relationMembers: [],
      conflictIds: [],
    },
  };
}

function stageValue(stage: string): unknown {
  if (stage === 'extract') {
    return {
      observations: [{
        sourceId: ids.source,
        spanStart: 0,
        spanEnd: 16,
        exactQuote: 'I kept learning.',
        normalizedAssertion: 'The user kept learning.',
        subjectKind: 'self',
        subjectLabel: null,
        subjectPersonId: null,
        domain: 'growth',
        assertionType: 'direct',
        eventTime: unknownTime,
        extractorVersion: 'fixture',
        verifierVersion: null,
      }],
      unknowns: [],
    };
  }
  if (stage === 'match_countercontext') {
    return {
      matches: [{ observationIndex: 0, targetObjectId: ids.object, matchKind: 'continuation', rationale: 'The source continues the existing goal.' }],
      countercontextObservationIds: [],
    };
  }
  if (stage === 'reconcile') {
    return {
      decisions: [{ observationIndex: 0, disposition: 'change_over_time', rationale: 'The goal remains active.', counterevidence: [] }],
      unresolvedQuestions: [],
    };
  }
  if (stage === 'compose' || stage === 'repair') {
    return {
      objects: [{
        key: 'goal-1',
        existingObjectId: ids.object,
        payload: {
          kind: 'goal', title: 'Keep learning', statedOutcome: 'Keep learning', underlyingValue: null,
          status: 'active', timeframe: unknownTime, purpose: null,
        },
        epistemicClass: 'reported', lifecycle: 'active', effectiveTime: unknownTime,
        sourceIds: [ids.source], observationIndexes: [0],
      }],
      relations: [],
      brief: 'The user continues to value learning.',
      decisionSummary: 'Updated the existing goal from the new source.',
      changedKeys: ['goal-1'],
      unresolvedQuestions: [],
    };
  }
  return { findings: [], acceptedItemKeys: ['goal-1'], unresolvedQuestions: [] };
}

function installStore(state: RecoveryState) {
  mocks.store = {
    claimJob: async () => {
      if (state.state === 'published' || state.noClaim) return null;
      state.state = 'running';
      return claim(state);
    },
    loadContext: async () => {
      if (state.loadError) throw state.loadError;
      return context(state);
    },
    renew: async () => undefined,
    assertFresh: async () => undefined,
    recordStage: async (_claim: unknown, input: { stageKey: string; state: string; metrics?: Record<string, number> }) => {
      state.stageReceipts.push({ stageKey: input.stageKey, state: input.state, metrics: input.metrics });
      return `receipt-${state.stageReceipts.length}`;
    },
    stageCheckpointKey: (_claim: unknown, stageKey: string, inputDigest: string) => `checkpoint:${stageKey}:${inputDigest}`,
    loadStageCheckpoint: async (_claim: unknown, key: string) => state.checkpoints.get(key) ?? null,
    saveStageCheckpoint: async (_claim: unknown, key: string, value: unknown, metadata: { provider: string | null; model: string | null }) => {
      const existing = state.checkpoints.get(key);
      if (existing) return existing.id;
      const item = { id: `payload-${state.checkpoints.size + 1}`, value, metadata };
      state.checkpoints.set(key, item);
      return item.id;
    },
    recordOutcomes: async (_claim: unknown, outcomes: Array<{ sourceId: string; outcome: string; code?: string | null }>) => {
      for (const outcome of outcomes) {
        if (!state.sourceOutcomes.some((item) => item.sourceId === outcome.sourceId)) state.sourceOutcomes.push(outcome);
      }
    },
    stageCandidate: async (_claim: unknown, candidate: unknown) => {
      const existing = state.candidates.find((item) => JSON.stringify(item.value) === JSON.stringify(candidate));
      if (existing) return existing.id;
      const item = { id: `candidate-${state.candidates.length + 1}`, value: candidate };
      state.candidates.push(item);
      return item.id;
    },
    newCommitId: () => '99999999-9999-4999-8999-999999999999',
    publish: async (_claim: unknown, candidateId: string) => {
      if (!state.publications.some((item) => item.candidateId === candidateId)) {
        state.activeRevision += 1;
        state.publications.push({ revision: state.activeRevision, candidateId });
      }
      state.state = 'published';
      return { published: true, revision: state.activeRevision };
    },
    fail: async (_claim: unknown, stage: string) => {
      state.failed = true;
      state.state = 'pending';
      state.availableAt = state.retryScheduled ? '2026-09-26T12:00:00.000Z' : null;
      state.failureReceipts.push({ stage, retryable: true });
      state.fence += 1;
    },
    pendingRetryAt: async () => state.availableAt,
    rebase: async () => ({ requeued: true }),
  };
}

describe('person consolidation deterministic recovery seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sleep.mockResolvedValue(undefined);
  });

  it.each(['compose', 'verify'] as const)(
    'recovers a fail-once %s stage without duplicating source effects or revisions',
    async (failureStage) => {
      const state = makeState(failureStage);
      installStore(state);
      mocks.callPersonStage.mockImplementation(async ({ stage }: { stage: string }) => {
        if (stage === failureStage && !state.failed) {
          const error = new Error(`deterministic ${failureStage} failure`);
          (error as Error & { status?: number }).status = 503;
          throw error;
        }
        return { value: stageValue(stage), metadata: { provider: 'deterministic-fixture', model: 'fail-once-fixture' } };
      });

      const result = await personConsolidationWorkflow(ids.job);
      expect(result.status).toBe('published');
      expect(mocks.sleep).toHaveBeenCalledTimes(1);
      expect(mocks.sleep).toHaveBeenCalledWith(new Date('2026-09-26T12:00:00.000Z'));
      expect(state.failed).toBe(true);
      expect(state.state).toBe('published');
      expect(state.activeRevision).toBe(2);
      expect(state.failureReceipts).toEqual([{ stage: failureStage, retryable: true }]);
      expect(state.candidates).toHaveLength(1);
      expect(state.publications).toHaveLength(1);
      expect(state.sourceOutcomes).toEqual([{ sourceId: ids.source, outcome: 'handled', code: null }]);
      for (const stage of ['extract', 'match_countercontext', 'reconcile', 'compose', 'verify']) {
        const calls = mocks.callPersonStage.mock.calls.filter(([input]) => input.stage === stage);
        // Extraction is reusable because its input is identical. Observation
        // IDs are regenerated by the next durable step, so every downstream
        // input digest changes and stale checkpoints must not be reused.
        const expected = stage === 'extract' ? 1
          : stage === 'verify' && failureStage === 'compose' ? 1
            : 2;
        expect(calls).toHaveLength(expected);
      }

      // A replay after publication is a no-op: the durable claim is gone.
      expect(await personConsolidationWorkflow(ids.job)).toEqual({ status: 'not_claimed' });
      expect(state.candidates).toHaveLength(1);
      expect(state.publications).toHaveLength(1);
      expect(state.sourceOutcomes).toHaveLength(1);
    },
  );

  it('does not sleep when a failed attempt has no database-scheduled retry', async () => {
    const state = makeState('compose');
    installStore(state);
    state.retryScheduled = false;
    mocks.callPersonStage.mockImplementation(async ({ stage }: { stage: string }) => {
      if (stage === 'compose') throw new Error('terminal failure');
      return { value: stageValue(stage), metadata: { provider: 'fixture', model: 'fixture' } };
    });

    await expect(personConsolidationWorkflow(ids.job)).rejects.toThrow(/failed safely/);
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it.each([
    ['not_claimed', null],
    ['lease_lost', new PersonLeaseLostError()],
  ] as const)('does not sleep for %s', async (status, error) => {
    const state = makeState('compose');
    installStore(state);
    if (status === 'not_claimed') state.noClaim = true;
    else state.loadError = error!;

    const result = await personConsolidationWorkflow(ids.job);
    expect(result.status).toBe(status);
    expect(mocks.sleep).not.toHaveBeenCalled();
  });
});
