/**
 * Durable ordinary-chat learning pipeline. The workflow input is only the
 * internal job id; every DB read/write and provider call is a replayable step.
 */
import { FatalError, sleep } from 'workflow';
import { createHash, randomUUID } from 'node:crypto';
import {
  callPersonStage,
  coldStartMatchAndReconciliation,
  explicitObjectChangeMatchAndReconciliation,
  MalformedPersonStageOutputError,
  PersonCompositionPlanSchema,
  PersonExtractionOutputSchema,
  PersonMatchOutputSchema,
  PersonReconciliationOutputSchema,
  PersonVerificationOutputSchema,
  PersonIdentifiedObservationSchema,
  schemaFor,
  type PersonExtractionOutput,
  PERSON_GUIDANCE_VERSION,
  PERSON_MODEL_POLICY_VERSION,
  materializeConsolidationCandidate,
  normalizeObservationSpans,
  personStageToolParameters,
  validateCountercontextCoverage,
  validateObservationSpans,
  validateVerificationReferences,
  verifiedCompositionSubset,
  resolveChangeIdsForPlan,
  bindExplicitObjectChangeTargets,
  bindPlanEvidenceToObservations,
  validateExplicitChangeCoverage,
  type PersonCompositionPlan,
  type PersonConsolidationStage,
  type MaterializedConsolidationCandidate,
} from '@/lib/person-model/consolidation';
import {
  PersonConsolidationStore,
  type PersonJobClaim,
} from '@/lib/person-model/consolidation-store';
import { isPersonLeaseLostError } from '@/lib/person-model/consolidation-errors';

const stageNames = {
  extract: 'extract_person_observations',
  match_countercontext: 'match_person_history',
  reconcile: 'reconcile_person_evidence',
  compose: 'compose_person_revision',
  verify: 'verify_person_revision',
  repair: 'repair_person_revision',
} as const;

const stageTokenBudgets: Record<PersonConsolidationStage, number> = {
  extract: 2_500,
  match_countercontext: 2_000,
  reconcile: 2_500,
  compose: 5_000,
  verify: 3_000,
  repair: 5_000,
};

const LEASE_LOST_MESSAGE = 'Person consolidation lease was lost; stale worker stopped.';

function stopRetryingStaleWorker(error: unknown): never {
  if (isPersonLeaseLostError(error)) throw new FatalError(LEASE_LOST_MESSAGE);
  throw error;
}

const systemGuidance = `You are a careful personal-history consolidation worker. Extract only explicit, source-grounded observations. A faithful normalized paraphrase of an explicit source statement is assertionType "direct"; use "derived" only when the observation adds a conclusion the source did not itself state, and use "reported_interpretation" when the person explicitly reports their own interpretation. Distinguish self, another person, hypothetical, and unknown attribution. Preserve uncertainty, conditions, exceptions, and counterevidence; do not diagnose, predict motivation, or invent later meaning. When a reported pattern has an explicit situation in which it does not hold, retain that situation in the pattern object's exceptions array; do not omit it or flatten it into a universal rule. For meaning changes, "unknown" means the person explicitly says the later meaning is unresolved, unclear, or not worked out; "not_yet_shared" is only for an explicit refusal or choice to withhold it. Dates must retain their stated precision. Represent an explicit time-bounded experience as an episode and an explicit stated aim as a goal when the source supports them; do not flatten concrete history into only an abstract pattern, but do not force unsupported ontology kinds. Every observation must quote an exact JavaScript string slice from one supplied source, with UTF-16 start/end offsets. A source with change metadata is an explicit user instruction: corrections and rejections must revise their named target rather than create an unrelated additive claim; an explicit exclusion is a control request and must not become a personal observation. Refer only to supplied source/object/observation IDs. Return only the requested structured result. Guidance ${PERSON_GUIDANCE_VERSION}; policy ${PERSON_MODEL_POLICY_VERSION}.`;

async function claimPersonJob(jobId: string): Promise<PersonJobClaim | null> {
  'use step';
  return new PersonConsolidationStore().claimJob(jobId);
}

async function loadPersonContext(claim: PersonJobClaim) {
  'use step';
  return new PersonConsolidationStore().loadContext(claim);
}

async function assignObservationIdsStep(observations: unknown[], sources: Parameters<typeof normalizeObservationSpans>[0]) {
  'use step';
  const identified = observations.map((value) => PersonIdentifiedObservationSchema.parse({
    ...(value as Record<string, unknown>),
    observationId: randomUUID(),
  }));
  return normalizeObservationSpans(sources, identified);
}

async function providerStageStep(input: {
  claim: PersonJobClaim;
  stage: PersonConsolidationStage;
  attempt?: number;
  content: unknown;
  expected: 'extract' | 'match_countercontext' | 'reconcile' | 'compose' | 'verify' | 'repair';
  changeContext?: {
    sources: Parameters<typeof bindExplicitObjectChangeTargets>[0];
    snapshot: Parameters<typeof bindExplicitObjectChangeTargets>[1];
    observations: Parameters<typeof bindPlanEvidenceToObservations>[1];
  };
}) {
  'use step';
  const store = new PersonConsolidationStore();
  const stageKey = ['verify', 'repair'].includes(input.stage) ? `${input.stage}:${input.attempt ?? 0}` : input.stage;
  try {
    await store.renew(input.claim);
  } catch (error) {
    stopRetryingStaleWorker(error);
  }
  await store.assertFresh(input.claim);
  const inputDigest = createHash('sha256').update(JSON.stringify({
    version: 'p3-stage-input.v1',
    stage: input.stage,
    expected: input.expected,
    content: input.content,
    changeContext: input.changeContext,
  })).digest('hex');
  const checkpointKey = store.stageCheckpointKey(input.claim, stageKey, inputDigest);
  const cached = await store.loadStageCheckpoint(input.claim, checkpointKey);
  if (cached) {
    const schemaParsed = schemaFor(input.stage).parse(cached.value);
    const targeted = input.changeContext && (input.expected === 'compose' || input.expected === 'repair')
      ? bindExplicitObjectChangeTargets(input.changeContext.sources, input.changeContext.snapshot, schemaParsed as PersonCompositionPlan)
      : schemaParsed;
    const parsed = input.changeContext && (input.expected === 'compose' || input.expected === 'repair')
      ? bindPlanEvidenceToObservations(targeted as PersonCompositionPlan, input.changeContext.observations)
      : targeted;
    await store.recordStage(input.claim, {
      stageKey,
      stage: input.stage === 'match_countercontext' ? 'match' : input.stage === 'repair' ? 'repair' : input.stage,
      state: 'succeeded',
      provider: cached.metadata.provider,
      model: cached.metadata.model,
      metrics: { cached: 1 },
      safeSummary: `${input.stage} stage reused a validated durable checkpoint.`,
      outputPayloadId: cached.id,
    });
    return { value: parsed, metadata: cached.metadata };
  }
  const start = Date.now();
  await store.recordStage(input.claim, {
    stageKey,
    stage: input.stage === 'match_countercontext' ? 'match' : input.stage === 'repair' ? 'repair' : input.stage,
    state: 'started',
    metrics: { inputBytes: Buffer.byteLength(JSON.stringify(input.content)) },
  });
  try {
    // The prototype deliberately uses the same proven model for conversation
    // and learning. Stage-specific overrides remain available for later
    // evaluation, but are not a hidden second default.
    const consolidationModel = process.env.PERSON_CONSOLIDATION_MODEL?.trim()
      || process.env.ASTROLOGER_MODEL?.trim()
      || (process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim()
        ? 'gpt-6-luna'
        : undefined);
    const invokeStage = (repair = false) => callPersonStage<unknown>({
        stage: input.stage,
        toolName: stageNames[input.stage],
        description: `Return the strictly validated ${input.stage} result for this person consolidation stage.`,
        parameters: personStageToolParameters(input.stage),
        system: repair
          ? `${systemGuidance}\nYour prior attempt did not return the required single structured tool result. Call the one supplied tool exactly once with a complete schema-valid object; emit no prose.`
          : systemGuidance,
        content: JSON.stringify(input.content),
        model: consolidationModel,
        // Go uses automatic tool selection. callPersonStage still validates the
        // exact returned tool name and complete local Zod contract before any
        // output can be staged or published.
        responseMode: 'tool',
        // Keep enough room for strict multi-object output without reserving an
        // unnecessarily large share of the provider's output-token rate limit.
        maxTokens: stageTokenBudgets[input.stage],
        // A malformed structure gets one isolated repair session below. Rate
        // limits, transport errors, and semantic verifier findings never use
        // this inline repair and remain governed by the durable job queue.
        sessionId: `person-${input.claim.jobId}-${input.claim.fence}-${stageKey}${repair ? '-schema-repair' : ''}`,
      });
    let result;
    try {
      result = await invokeStage();
    } catch (error) {
      if (!(error instanceof MalformedPersonStageOutputError)) throw error;
      result = await invokeStage(true);
    }
    const schemaParsed = input.expected === 'extract' ? PersonExtractionOutputSchema.parse(result.value)
      : input.expected === 'match_countercontext' ? PersonMatchOutputSchema.parse(result.value)
        : input.expected === 'reconcile' ? PersonReconciliationOutputSchema.parse(result.value)
          : input.expected === 'compose' || input.expected === 'repair' ? PersonCompositionPlanSchema.parse(result.value)
            : PersonVerificationOutputSchema.parse(result.value);
    const targeted = input.changeContext && (input.expected === 'compose' || input.expected === 'repair')
      ? bindExplicitObjectChangeTargets(input.changeContext.sources, input.changeContext.snapshot, schemaParsed as PersonCompositionPlan)
      : schemaParsed;
    const parsed = input.changeContext && (input.expected === 'compose' || input.expected === 'repair')
      ? bindPlanEvidenceToObservations(targeted as PersonCompositionPlan, input.changeContext.observations)
      : targeted;
    await store.renew(input.claim);
    await store.assertFresh(input.claim);
    const outputPayloadId = await store.saveStageCheckpoint(input.claim, checkpointKey, parsed, result.metadata);
    await store.recordStage(input.claim, {
      stageKey,
      stage: input.stage === 'match_countercontext' ? 'match' : input.stage,
      state: 'succeeded',
      provider: result.metadata.provider,
      model: result.metadata.model,
      metrics: { durationMs: Date.now() - start, outputBytes: Buffer.byteLength(JSON.stringify(parsed)) },
      safeSummary: `${input.stage} stage completed with validated structured output.`,
      outputPayloadId,
    });
    return { value: parsed, metadata: result.metadata };
  } catch (error) {
    if (isPersonLeaseLostError(error)) stopRetryingStaleWorker(error);
    try {
      await store.recordStage(input.claim, {
        stageKey,
        stage: input.stage === 'match_countercontext' ? 'match' : input.stage,
        state: error instanceof MalformedPersonStageOutputError ? 'needs_clarification' : 'retryable_failure',
        metrics: { durationMs: Date.now() - start },
        safeSummary: 'Structured stage did not complete.',
        errorCode: error instanceof MalformedPersonStageOutputError ? error.code : 'provider_or_stage_failure',
      });
    } catch (receiptError) {
      stopRetryingStaleWorker(receiptError);
    }
    throw error;
  }
}

// Provider errors are persisted and retried by the fenced person_jobs queue.
// Disabling the SDK's immediate step retry avoids multiplying a single 429
// into four provider calls before the durable backoff policy can run.
providerStageStep.maxRetries = 0;

async function recordSourceOutcomesStep(claim: PersonJobClaim, sources: Array<{ sourceId: string; inclusion: string }>, plan: PersonCompositionPlan, partial: boolean, unresolvedSourceIds: string[]): Promise<void> {
  'use step';
  const represented = new Set([...plan.objects.flatMap((item) => item.sourceIds), ...unresolvedSourceIds]);
  for (const relation of plan.relations) relation.sourceIds.forEach((sourceId) => represented.add(sourceId));
  await new PersonConsolidationStore().recordOutcomes(claim, sources.map((source) => ({
    sourceId: source.sourceId,
    outcome: source.inclusion !== 'included' ? 'excluded'
      : partial && represented.has(source.sourceId) ? 'partial' : 'handled',
    code: source.inclusion !== 'included' ? 'source_excluded' : partial ? 'partial_verification' : null,
  })));
}

async function recordDeterministicStageStep(
  claim: PersonJobClaim,
  stageKey: 'match_countercontext' | 'reconcile',
  stage: 'match' | 'reconcile',
  reason: 'cold_start' | 'explicit_change',
): Promise<void> {
  'use step';
  const store = new PersonConsolidationStore();
  await store.renew(claim);
  await store.assertFresh(claim);
  await store.recordStage(claim, {
    stageKey,
    stage,
    state: 'succeeded',
    provider: 'deterministic',
    model: null,
    metrics: reason === 'cold_start' ? { coldStart: 1 } : { explicitChange: 1 },
    safeSummary: reason === 'cold_start'
      ? `${stage} completed deterministically because no prior person-model evidence existed.`
      : `${stage} completed deterministically from the typed change target and its prior evidence.`,
  });
}

async function materializeStep(input: Parameters<typeof materializeConsolidationCandidate>[0]) {
  'use step';
  return materializeConsolidationCandidate(input);
}

async function stageCandidateStep(claim: PersonJobClaim, candidate: MaterializedConsolidationCandidate) {
  'use step';
  return new PersonConsolidationStore().stageCandidate(claim, candidate);
}

async function createCommitIdStep(): Promise<string> {
  'use step';
  return new PersonConsolidationStore().newCommitId();
}

async function publishStep(claim: PersonJobClaim, candidateId: string, commitId: string) {
  'use step';
  // The SQL publisher revalidates the mode/privacy/base tuple and checks the
  // stable commit id before its fence checks, so a lost response replays safely.
  return new PersonConsolidationStore().publish(claim, candidateId, commitId);
}

async function failStep(claim: PersonJobClaim, stage: string, error: unknown) {
  'use step';
  await new PersonConsolidationStore().fail(claim, stage, error);
}

async function rebaseStep(claim: PersonJobClaim) {
  'use step';
  return new PersonConsolidationStore().rebase(claim);
}

async function pendingRetryAtStep(jobId: string) {
  'use step';
  return new PersonConsolidationStore().pendingRetryAt(jobId);
}

/** Ordinary accepted sources consolidate without waiting for an answer run. */
export async function personConsolidationWorkflow(jobId: string) {
  'use workflow';
  while (true) {
    const result = await consolidatePersonAttempt(jobId);
    if (result.status !== 'retry_pending') return result;
    // The database owns retry eligibility, attempt limits, and backoff. A
    // durable timer wakes this existing workflow without requiring another
    // user message, a browser test, or a frequent paid cron schedule.
    await sleep(new Date(result.availableAt));
  }
}

async function consolidatePersonAttempt(jobId: string) {
  const claim = await claimPersonJob(jobId);
  if (!claim) return { status: 'not_claimed' as const };
  let currentStage = 'load';
  try {
    const context = await loadPersonContext(claim);
    currentStage = 'extract';
    const extracted = await providerStageStep({
      claim, stage: 'extract', expected: 'extract',
      content: { sources: context.includedSources },
    });
    const extraction = PersonExtractionOutputSchema.parse(extracted.value) as PersonExtractionOutput;
    const observations = await assignObservationIdsStep(extraction.observations, context.includedSources);
    validateObservationSpans(context.includedSources, observations);
    if (observations.some((observation) => !context.includedSources.some((source) => source.sourceId === observation.sourceId))) {
      throw new MalformedPersonStageOutputError('Extraction referenced a source outside the included job sources.');
    }
    const includedSourceIds = new Set(context.includedSources.map((source) => source.sourceId));
    if (extraction.unknowns.some((item) => !includedSourceIds.has(item.sourceId))) {
      throw new MalformedPersonStageOutputError('Extraction unknown referenced a source outside the included job sources.');
    }

    const coldStart = context.snapshot.objectMembers.length === 0 && context.countercontext.length === 0;
    const explicitChange = explicitObjectChangeMatchAndReconciliation(
      context.includedSources,
      context.snapshot,
      context.countercontext,
      observations,
    );
    const deterministic = explicitChange ?? (coldStart ? coldStartMatchAndReconciliation(observations.length) : null);
    const deterministicReason = explicitChange ? 'explicit_change' as const : 'cold_start' as const;
    currentStage = 'match';
    const matched = deterministic ? null : await providerStageStep({
      claim, stage: 'match_countercontext', expected: 'match_countercontext',
      content: { observations, currentObjects: context.snapshot.objectMembers, countercontext: context.countercontext },
    });
    if (deterministic) await recordDeterministicStageStep(claim, 'match_countercontext', 'match', deterministicReason);
    const matchOutput = deterministic?.match ?? matched!.value as any;
    if (matchOutput.matches.length !== observations.length || matchOutput.matches.some((match: any, index: number) => match.observationIndex !== index)) {
      throw new MalformedPersonStageOutputError('Match stage must return exactly one ordered match per observation.');
    }
    const counterIds = new Set(context.countercontext.map((item) => item.observationId));
    if (matchOutput.countercontextObservationIds.some((id: string) => !counterIds.has(id))) {
      throw new MalformedPersonStageOutputError('Match stage referenced unavailable countercontext.');
    }
    const selectedCountercontext = context.countercontext.filter((item) => matchOutput.countercontextObservationIds.includes(item.observationId));

    currentStage = 'reconcile';
    const reconciled = deterministic ? null : await providerStageStep({
      claim, stage: 'reconcile', expected: 'reconcile',
        content: { observations, extractionUnknowns: extraction.unknowns, matches: matchOutput.matches, countercontext: selectedCountercontext, existingRelations: context.snapshot.relationMembers },
    });
    if (deterministic) await recordDeterministicStageStep(claim, 'reconcile', 'reconcile', deterministicReason);
    const reconciliation = deterministic?.reconciliation ?? reconciled!.value as any;
    validateCountercontextCoverage(selectedCountercontext, reconciliation);
    if (reconciliation.decisions.length !== observations.length || reconciliation.decisions.some((decision: any, index: number) => decision.observationIndex !== index)) {
      throw new MalformedPersonStageOutputError('Reconciliation must provide exactly one ordered decision per observation.');
    }

    currentStage = 'compose';
    const composed = await providerStageStep({
      claim, stage: 'compose', expected: 'compose',
      changeContext: { sources: context.includedSources, snapshot: context.snapshot, observations },
      content: {
        sources: context.includedSources,
        observations,
        matches: matchOutput.matches,
        reconciliation,
        extractionUnknowns: extraction.unknowns,
        currentObjects: context.snapshot.objectMembers,
        currentRelations: context.snapshot.relationMembers,
      },
    });
    let plan = composed.value as PersonCompositionPlan;
    let verification: any = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      currentStage = 'verify';
      const verified = await providerStageStep({
        claim, stage: 'verify', attempt, expected: 'verify',
        content: { plan, sources: context.includedSources, observations, reconciliation, currentObjects: context.snapshot.objectMembers },
      });
      verification = verified.value;
      validateVerificationReferences(
        plan,
        verification,
        context.includedSources.map((source) => source.sourceId),
        observations.map((observation) => observation.observationId),
      );
      const accepted = verifiedCompositionSubset(plan, verification);
      const hasBlocking = verification.findings.some((finding: any) => finding.severity === 'blocking');
      if (!hasBlocking || attempt === 2) {
        plan = accepted;
        break;
      }
      currentStage = 'repair';
      const repaired = await providerStageStep({
        claim, stage: 'repair', attempt, expected: 'repair',
        changeContext: { sources: context.includedSources, snapshot: context.snapshot, observations },
        content: {
          plan,
          blockingFindings: verification.findings.filter((finding: any) => finding.severity === 'blocking'),
          sources: context.includedSources,
          observations,
          currentObjects: context.snapshot.objectMembers,
        },
      });
      plan = repaired.value as PersonCompositionPlan;
    }
    if (!verification) throw new Error('Person consolidation verifier did not run.');
    const hasUnresolved = verification.findings.some((finding: any) => finding.severity === 'blocking')
      || plan.unresolvedQuestions.length > 0;
    const partial = hasUnresolved;
    validateExplicitChangeCoverage(context.includedSources, plan);
    const outcomeSources = context.sources.map((source) => ({
      sourceId: source.sourceId,
      inclusion: source.inclusion,
    }));
    await recordSourceOutcomesStep(claim, outcomeSources, plan, partial,
      extraction.unknowns.map((item) => item.sourceId));

    currentStage = 'materialize';
    const candidate = await materializeStep({
      snapshot: context.snapshot,
      plan,
      observations,
      sources: context.includedSources,
      sourceIds: context.includedSources.map((source) => source.sourceId),
      resolveChangeIds: resolveChangeIdsForPlan(context.includedSources, plan),
      verification,
      provider: composed.metadata.provider,
      model: composed.metadata.model,
    });
    currentStage = 'stage';
    const candidateId = await stageCandidateStep(claim, candidate);
    if (!candidateId) throw new Error('Candidate staging returned no id.');
    currentStage = 'publish';
    const published = await publishStep(claim, candidateId, await createCommitIdStep());
    return { status: partial ? 'partially_published' as const : 'published' as const, published };
  } catch (error) {
    if (error instanceof Error && error.message.includes(LEASE_LOST_MESSAGE)) {
      return { status: 'lease_lost' as const };
    }
    if (isPersonLeaseLostError(error)) return { status: 'lease_lost' as const };
    if (error instanceof Error && /freshness tuple changed|freshness or lease fence changed/i.test(error.message)) {
      const rebased = await rebaseStep(claim);
      const availableAt = await pendingRetryAtStep(jobId);
      if (availableAt) return { status: 'retry_pending' as const, availableAt };
      return { status: 'requeued_or_cancelled' as const, rebase: rebased };
    }
    try {
      await failStep(claim, currentStage, error);
    } catch (failureError) {
      if (isPersonLeaseLostError(failureError)
        || (failureError instanceof Error && failureError.message.includes(LEASE_LOST_MESSAGE))) {
        return { status: 'lease_lost' as const };
      }
      throw failureError;
    }
    const availableAt = await pendingRetryAtStep(jobId);
    if (availableAt) return { status: 'retry_pending' as const, availableAt };
    throw new FatalError('Person consolidation failed safely and the source remains available for retry.');
  }
}
