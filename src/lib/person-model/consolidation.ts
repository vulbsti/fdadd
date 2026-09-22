import { z } from 'zod';
import { chatCompletion } from '@/lib/ai/provider';
import type { ChatCompletionOptions, ChatCompletionResult, FunctionToolDefinition } from '@/lib/ai/provider';
import {
  LifecycleSchema,
  PersonVersionLifecycleSchema,
  PersonObjectPayloadSchema,
  PersonObservationDraftBaseSchema,
  PersonObservationDraftSchema,
  PersonPublicationCandidateSchema,
  PersonRelationKindSchema,
  TimeRangeSchema,
  type PersonPublicationCandidate,
  type PersonObservationDraft,
} from './contracts';

const uuid = z.string().uuid();
const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const ConsolidationSourceSchema = z.object({
  sourceId: uuid,
  sourceSeq: z.number().int().positive(),
  sourceTime: z.string().datetime({ offset: true }).nullable(),
  ingestedAt: z.string().datetime({ offset: true }),
  sourceKind: z.enum(['native_message', 'explicit_correction', 'explicit_exclusion', 'import_item', 'other']),
  speaker: z.enum(['user', 'assistant', 'tool', 'system', 'unknown']),
  subjectKind: z.enum(['self', 'other', 'hypothetical', 'unknown']),
  subjectLabel: z.string().max(180).nullable(),
  inclusion: z.enum(['included', 'excluded', 'pending', 'retracted']),
  body: z.string().min(1).max(24_000),
  change: z.object({
    changeId: uuid,
    changeKind: z.enum(['correction', 'rejection', 'exclusion', 'inclusion', 'deletion', 'merge', 'split']),
    targetKind: z.enum(['object', 'relation', 'source', 'person']),
    targetId: uuid,
    priorVersionId: uuid.nullable(),
    request: z.record(z.string(), z.unknown()),
    invalidatedObjectIds: z.array(uuid).max(500),
  }).strict().nullable(),
}).strict();
export type ConsolidationSource = z.infer<typeof ConsolidationSourceSchema>;

export const CountercontextItemSchema = z.object({
  observationId: uuid,
  sourceId: uuid,
  subjectKind: z.enum(['self', 'other', 'hypothetical', 'unknown']),
  assertionType: z.enum(['direct', 'derived', 'reported_interpretation', 'assistant_hypothesis', 'unknown']),
  status: z.enum(['proposed', 'verified', 'rejected', 'superseded']),
  assertion: boundedText(2_000),
  eventTime: TimeRangeSchema,
}).strict();
export type CountercontextItem = z.infer<typeof CountercontextItemSchema>;

export const ExistingObjectContextSchema = z.object({
  objectId: uuid,
  versionId: uuid,
  versionNo: z.number().int().positive(),
  kind: z.string().min(1).max(80),
  epistemicClass: z.enum(['reported', 'working_hypothesis', 'unknown']),
  lifecycle: PersonVersionLifecycleSchema,
  payload: PersonObjectPayloadSchema,
  effectiveTime: TimeRangeSchema,
  sourceIds: z.array(uuid).max(200),
  observationIds: z.array(uuid).max(200),
}).strict();
export type ExistingObjectContext = z.infer<typeof ExistingObjectContextSchema>;

export const ExistingRelationContextSchema = z.object({
  relationId: uuid,
  versionId: uuid,
  versionNo: z.number().int().positive(),
  kind: PersonRelationKindSchema,
  fromObjectId: uuid,
  toObjectId: uuid,
  epistemicClass: z.enum(['reported', 'working_hypothesis', 'unknown']),
  lifecycle: PersonVersionLifecycleSchema,
  rationale: z.string().max(1_000).nullable(),
  sourceIds: z.array(uuid).max(200),
  observationIds: z.array(uuid).max(200),
}).strict();
export type ExistingRelationContext = z.infer<typeof ExistingRelationContextSchema>;

export const PersonExtractionOutputSchema = z.object({
  observations: z.array(PersonObservationDraftSchema).max(100),
  unknowns: z.array(z.object({
    sourceId: uuid,
    question: boundedText(500),
    whyMaterial: boundedText(500),
  }).strict()).max(30),
}).strict();
export type PersonExtractionOutput = z.infer<typeof PersonExtractionOutputSchema>;

export const PersonIdentifiedObservationSchema = PersonObservationDraftBaseSchema.extend({ observationId: uuid })
  .superRefine((value, ctx) => {
    if (value.spanStart !== null && value.spanEnd !== null && value.spanEnd < value.spanStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Observation span end must not precede start.' });
    }
  });
export type PersonIdentifiedObservation = z.infer<typeof PersonIdentifiedObservationSchema>;

export const PersonMatchOutputSchema = z.object({
  matches: z.array(z.object({
    observationIndex: z.number().int().nonnegative(),
    targetObjectId: uuid.nullable(),
    matchKind: z.enum(['same_experience', 'same_entity', 'continuation', 'correction_target', 'no_match', 'uncertain']),
    rationale: boundedText(800),
  }).strict()).max(100),
  countercontextObservationIds: z.array(uuid).max(200),
}).strict().superRefine((output, ctx) => {
  const seen = new Set<number>();
  output.matches.forEach((match, index) => {
    if (seen.has(match.observationIndex)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matches', index, 'observationIndex'], message: 'Each observation may be matched once.' });
    }
    seen.add(match.observationIndex);
    if (match.matchKind === 'no_match' && match.targetObjectId !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matches', index, 'targetObjectId'], message: 'A no-match result must not name an object.' });
    }
    if (match.matchKind !== 'no_match' && match.matchKind !== 'uncertain' && match.targetObjectId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matches', index, 'targetObjectId'], message: 'A resolved match kind requires an object.' });
    }
  });
  if (new Set(output.countercontextObservationIds).size !== output.countercontextObservationIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['countercontextObservationIds'], message: 'Countercontext IDs must be unique.' });
  }
});
export type PersonMatchOutput = z.infer<typeof PersonMatchOutputSchema>;

export const PersonReconciliationOutputSchema = z.object({
  decisions: z.array(z.object({
    observationIndex: z.number().int().nonnegative(),
    disposition: z.enum(['new', 'correction', 'change_over_time', 'context_qualification', 'duplicate', 'unresolved_contradiction', 'unsupported_prior_inference', 'not_materialized']),
    rationale: boundedText(1_000),
    counterevidence: z.array(z.object({
      observationId: uuid,
      impact: z.enum(['qualifies', 'contradicts', 'not_applicable']),
      rationale: boundedText(800),
    }).strict()).max(100),
  }).strict()).max(100),
  unresolvedQuestions: z.array(boundedText(500)).max(50),
}).strict().superRefine((output, ctx) => {
  const seen = new Set<number>();
  output.decisions.forEach((decision, index) => {
    if (seen.has(decision.observationIndex)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisions', index, 'observationIndex'], message: 'Each observation must have one reconciliation decision.' });
    }
    seen.add(decision.observationIndex);
  });
});
export type PersonReconciliationOutput = z.infer<typeof PersonReconciliationOutputSchema>;

const PersonPlanReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), objectId: uuid }).strict(),
  z.object({ kind: z.literal('planned'), key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).strict(),
]);

export const PersonCompositionPlanSchema = z.object({
  objects: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    existingObjectId: uuid.nullable(),
    payload: PersonObjectPayloadSchema,
    epistemicClass: z.enum(['reported', 'working_hypothesis', 'unknown']),
    lifecycle: PersonVersionLifecycleSchema,
    effectiveTime: TimeRangeSchema,
    sourceIds: z.array(uuid).min(1).max(200),
    observationIndexes: z.array(z.number().int().nonnegative()).min(1).max(100),
  }).strict()).max(200),
  relations: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    existingRelationId: uuid.nullable(),
    kind: PersonRelationKindSchema,
    from: PersonPlanReferenceSchema,
    to: PersonPlanReferenceSchema,
    rationale: z.string().max(1_000).nullable(),
    sourceIds: z.array(uuid).min(1).max(200),
    observationIndexes: z.array(z.number().int().nonnegative()).min(1).max(100),
  }).strict()).max(500),
  brief: z.string().max(12_000),
  decisionSummary: z.string().max(4_000),
  changedKeys: z.array(z.string().min(1).max(80)).max(500),
  unresolvedQuestions: z.array(boundedText(500)).max(50),
}).strict().superRefine((plan, ctx) => {
  const keys = new Set<string>();
  const existingObjectIds = new Set<string>();
  plan.objects.forEach((object, index) => {
    if (keys.has(object.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objects', index, 'key'], message: 'Object keys must be unique.' });
    keys.add(object.key);
    if (object.existingObjectId && existingObjectIds.has(object.existingObjectId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objects', index, 'existingObjectId'], message: 'An existing object may be updated only once per plan.' });
    }
    if (object.existingObjectId) existingObjectIds.add(object.existingObjectId);
    if (!object.payload.kind) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objects', index, 'payload'], message: 'Object payload must be discriminated.' });
  });
  const relationKeys = new Set<string>();
  const existingRelationIds = new Set<string>();
  plan.relations.forEach((relation, index) => {
    if (relationKeys.has(relation.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'key'], message: 'Relation keys must be unique.' });
    relationKeys.add(relation.key);
    if (relation.existingRelationId && existingRelationIds.has(relation.existingRelationId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'existingRelationId'], message: 'An existing relation may be updated only once per plan.' });
    }
    if (relation.existingRelationId) existingRelationIds.add(relation.existingRelationId);
    if (relation.from.kind === 'planned' && !keys.has(relation.from.key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'from'], message: 'Relation source must be present in the plan.' });
    }
    if (relation.to.kind === 'planned' && !keys.has(relation.to.key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'to'], message: 'Relation target must be present in the plan.' });
    }
  });
});
export type PersonCompositionPlan = z.infer<typeof PersonCompositionPlanSchema>;

const StagedObservationSchema = PersonObservationDraftBaseSchema.extend({
  observationId: uuid,
  normalizedAssertion: z.object({ text: boundedText(2_000) }).strict(),
}).superRefine((value, ctx) => {
  if (value.spanStart !== null && value.spanEnd !== null && value.spanEnd < value.spanStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Observation span end must not precede start.' });
  }
});

const StagedObjectSchema = z.object({
  objectId: uuid,
  versionId: uuid,
  kind: z.string().min(1).max(80),
  versionNo: z.number().int().positive(),
  epistemicClass: z.enum(['reported', 'working_hypothesis', 'unknown']),
  lifecycle: PersonVersionLifecycleSchema,
  typedPayload: PersonObjectPayloadSchema,
  effectiveFrom: z.string().datetime({ offset: true }).nullable(),
  effectiveTo: z.string().datetime({ offset: true }).nullable(),
  timePrecision: z.enum(['exact', 'day', 'month', 'year', 'range', 'age', 'relative', 'unknown']),
}).strict().superRefine((item, ctx) => {
  if (item.kind !== item.typedPayload.kind) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kind'], message: 'Staged object kind must match its typed payload.' });
  }
});

export const MaterializedConsolidationCandidateSchema = z.object({
  baseRevision: z.number().int().positive(),
  privacyEpoch: z.number().int().nonnegative(),
  modeEpoch: z.number().int().nonnegative(),
  processedSourceSeq: z.number().int().nonnegative(),
  schemaVersion: z.string().min(1).max(80),
  guidanceVersion: z.string().max(120),
  modelPolicyVersion: z.string().max(120),
  provider: z.string().max(100).nullable(),
  model: z.string().max(180).nullable(),
  observations: z.array(StagedObservationSchema).max(500),
  objects: z.array(StagedObjectSchema).max(200),
  objectSupport: z.array(z.object({
    versionId: uuid,
    sourceId: uuid.nullable(),
    observationId: uuid.nullable(),
    relation: z.enum(['supports', 'contradicts', 'qualifies']),
    note: z.string().max(500).nullable(),
    weight: z.number().min(0).max(1).nullable(),
  }).strict()).max(2_000),
  relations: z.array(z.object({
    relationId: uuid,
    versionId: uuid,
    versionNo: z.number().int().positive(),
    fromObjectId: uuid,
    toObjectId: uuid,
    relationKind: PersonRelationKindSchema,
    lifecycle: PersonVersionLifecycleSchema,
    epistemicClass: z.enum(['reported', 'working_hypothesis', 'unknown']),
    rationale: z.string().max(1_000).nullable(),
    typedPayload: z.object({ rationale: z.string().max(1_000).nullable() }).strict(),
  }).strict()).max(500),
  relationSupport: z.array(z.object({
    versionId: uuid,
    sourceId: uuid.nullable(),
    observationId: uuid.nullable(),
    relation: z.enum(['supports', 'contradicts', 'qualifies']),
  }).strict()).max(2_000),
  publication: PersonPublicationCandidateSchema,
}).strict();
export type MaterializedConsolidationCandidate = z.infer<typeof MaterializedConsolidationCandidateSchema>;

export interface ConsolidationSnapshot {
  baseRevision: number;
  privacyEpoch: number;
  modeEpoch: number;
  /** Highest contiguous source sequence that this job will mark terminal. */
  processedSourceSeq: number;
  objectMembers: ExistingObjectContext[];
  relationMembers: ExistingRelationContext[];
  conflictIds: string[];
}

function isoValue(value: string | null, precision: string): string | null {
  if (!value) return null;
  if (value.includes('T')) return value;
  return `${value}T00:00:00.000Z`;
}

function dbTimePrecision(precision: string): MaterializedConsolidationCandidate['objects'][number]['timePrecision'] {
  return ['exact', 'day', 'month', 'year', 'range', 'age', 'relative', 'unknown'].includes(precision)
    ? precision as MaterializedConsolidationCandidate['objects'][number]['timePrecision']
    : 'unknown';
}

/**
 * Convert a verified delta plan into an immutable revision candidate. Existing
 * memberships are copied forward so incremental updates never erase unrelated
 * facts; only changed versions are materialized for the fenced SQL publisher.
 * Call this from a durable Workflow step so generated IDs are replay-stable.
 */
export function materializeConsolidationCandidate(input: {
  snapshot: ConsolidationSnapshot;
  plan: PersonCompositionPlan;
  observations: Array<PersonObservationDraft & { observationId?: string }>;
  sourceIds: string[];
  resolveChangeIds?: string[];
  verification: PersonVerificationOutput;
  provider: string | null;
  model: string | null;
}): MaterializedConsolidationCandidate {
  const { snapshot, plan, observations } = input;
  const objectById = new Map(snapshot.objectMembers.map((object) => [object.objectId, object]));
  const relationById = new Map(snapshot.relationMembers.map((relation) => [relation.relationId, relation]));
  const validSourceIds = new Set(input.sourceIds);
  const stagedObservations = observations.map((observation) => ({
    ...observation,
    observationId: observation.observationId ?? crypto.randomUUID(),
    normalizedAssertion: { text: observation.normalizedAssertion },
  }));
  const stagedObjects: MaterializedConsolidationCandidate['objects'] = [];
  const objectSupport: MaterializedConsolidationCandidate['objectSupport'] = [];
  const objectMemberMap = new Map(snapshot.objectMembers.map((object) => [object.objectId, {
    objectId: object.objectId,
    versionId: object.versionId,
  }]));
  const plannedKeyToObjectId = new Map<string, string>();
  const changedObjectIds = new Set<string>();

  for (const item of plan.objects) {
    if (item.sourceIds.some((sourceId) => !validSourceIds.has(sourceId))) {
      throw new MalformedPersonStageOutputError('Composition referenced a source outside the current job.');
    }
    if (item.observationIndexes.some((index) => !observations[index])) {
      throw new MalformedPersonStageOutputError('Composition referenced an unknown extracted observation.');
    }
    const prior = item.existingObjectId ? objectById.get(item.existingObjectId) : undefined;
    if (item.existingObjectId && !prior) {
      throw new MalformedPersonStageOutputError('Composition referenced an object outside the current revision.');
    }
    if (prior && prior.kind !== item.payload.kind) {
      throw new MalformedPersonStageOutputError('Composition changed an existing object to a different kind.');
    }
    const objectId = prior?.objectId ?? crypto.randomUUID();
    const versionId = crypto.randomUUID();
    plannedKeyToObjectId.set(item.key, objectId);
    changedObjectIds.add(objectId);
    stagedObjects.push({
      objectId,
      versionId,
      kind: item.payload.kind,
      versionNo: (prior?.versionNo ?? 0) + 1,
      epistemicClass: item.epistemicClass,
      lifecycle: item.lifecycle,
      typedPayload: item.payload,
      effectiveFrom: isoValue(item.effectiveTime.start, item.effectiveTime.precision),
      effectiveTo: isoValue(item.effectiveTime.end, item.effectiveTime.precision),
      timePrecision: dbTimePrecision(item.effectiveTime.precision),
    });
    if (item.lifecycle === 'active') objectMemberMap.set(objectId, { objectId, versionId });
    else objectMemberMap.delete(objectId);

    const supportedSources = new Set(item.sourceIds);
    for (const sourceId of supportedSources) objectSupport.push({ versionId, sourceId, observationId: null, relation: 'supports', note: null, weight: null });
    for (const observationIndex of item.observationIndexes) {
      objectSupport.push({ versionId, sourceId: null, observationId: stagedObservations[observationIndex]!.observationId, relation: 'supports', note: null, weight: null });
    }
  }

  const resolveRef = (ref: z.infer<typeof PersonPlanReferenceSchema>): string => {
    if (ref.kind === 'planned') {
      const id = plannedKeyToObjectId.get(ref.key);
      if (!id || !objectMemberMap.has(id)) throw new MalformedPersonStageOutputError('Relation referenced an inactive or unknown planned object.');
      return id;
    }
    if (!objectMemberMap.has(ref.objectId)) {
      throw new MalformedPersonStageOutputError('Relation referenced an object outside the active candidate revision.');
    }
    return ref.objectId;
  };

  const relationMembers = new Map(snapshot.relationMembers
    .filter((relation) => objectMemberMap.has(relation.fromObjectId) && objectMemberMap.has(relation.toObjectId))
    .map((relation) => [relation.relationId, {
      relationId: relation.relationId,
      versionId: relation.versionId,
    }]));
  const stagedRelations: MaterializedConsolidationCandidate['relations'] = [];
  const relationSupport: MaterializedConsolidationCandidate['relationSupport'] = [];
  const changedRelationIds = new Set<string>();
  for (const item of plan.relations) {
    if (item.sourceIds.some((sourceId) => !validSourceIds.has(sourceId))) {
      throw new MalformedPersonStageOutputError('Relation referenced a source outside the current job.');
    }
    if (item.observationIndexes.some((index) => !observations[index])) {
      throw new MalformedPersonStageOutputError('Relation referenced an unknown extracted observation.');
    }
    const prior = item.existingRelationId ? relationById.get(item.existingRelationId) : undefined;
    if (item.existingRelationId && !prior) {
      throw new MalformedPersonStageOutputError('Composition referenced a relation outside the current revision.');
    }
    const relationId = prior?.relationId ?? crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const fromObjectId = resolveRef(item.from);
    const toObjectId = resolveRef(item.to);
    if (fromObjectId === toObjectId) throw new MalformedPersonStageOutputError('Relation endpoints must be different objects.');
    changedRelationIds.add(relationId);
    stagedRelations.push({
      relationId,
      versionId,
      versionNo: (prior?.versionNo ?? 0) + 1,
      fromObjectId,
      toObjectId,
      relationKind: item.kind,
      lifecycle: 'active',
      epistemicClass: 'reported',
      rationale: item.rationale,
      typedPayload: { rationale: item.rationale },
    });
    relationMembers.set(relationId, { relationId, versionId });
    const supportedSources = new Set(item.sourceIds);
    for (const sourceId of supportedSources) relationSupport.push({ versionId, sourceId, observationId: null, relation: 'supports' });
    for (const observationIndex of item.observationIndexes) {
      relationSupport.push({ versionId, sourceId: null, observationId: stagedObservations[observationIndex]!.observationId, relation: 'supports' });
    }
  }

  const findings = input.verification.findings;
  const publication: PersonPublicationCandidate = PersonPublicationCandidateSchema.parse({
    processedSourceSeq: snapshot.processedSourceSeq,
    objectMembers: [...objectMemberMap.values()],
    relationMembers: [...relationMembers.values()],
    conflictIds: snapshot.conflictIds,
    resolveChangeIds: input.resolveChangeIds ?? [],
    brief: plan.brief,
    changedIds: [...new Set([...changedObjectIds, ...changedRelationIds])],
    decisionSummary: plan.decisionSummary,
    verifierReceipt: {
      version: 'person-verifier.v1',
      findings,
      acceptedItemKeys: input.verification.acceptedItemKeys,
      unresolvedQuestions: [...new Set([...plan.unresolvedQuestions, ...input.verification.unresolvedQuestions])],
    },
    schemaVersion: 'person-consolidation.v1',
    guidanceVersion: PERSON_GUIDANCE_VERSION,
    modelPolicyVersion: PERSON_MODEL_POLICY_VERSION,
  });

  // UUIDs are assigned inside this durable materialization step so support
  // rows point at the exact observation records inserted by the publisher.
  return MaterializedConsolidationCandidateSchema.parse({
    baseRevision: snapshot.baseRevision,
    privacyEpoch: snapshot.privacyEpoch,
    modeEpoch: snapshot.modeEpoch,
    processedSourceSeq: snapshot.processedSourceSeq,
    schemaVersion: 'person-consolidation.v1',
    guidanceVersion: PERSON_GUIDANCE_VERSION,
    modelPolicyVersion: PERSON_MODEL_POLICY_VERSION,
    provider: input.provider,
    model: input.model,
    observations: stagedObservations,
    objects: stagedObjects,
    objectSupport,
    relations: stagedRelations,
    relationSupport,
    publication,
  });
}

/**
 * A change is resolved only when the verified plan actually represents it.
 * Object changes must touch their target, rejections must actually remove it
 * from active membership, and additive changes must use their source as
 * support. Exclusions resolve only after context loading has removed every
 * impacted object and relation from the candidate snapshot, so resolving the
 * change cannot expose content derived from the excluded source again.
 */
export function resolveChangeIdsForPlan(
  sources: ConsolidationSource[],
  plan: PersonCompositionPlan,
): string[] {
  const representedSourceIds = new Set([
    ...plan.objects.flatMap((item) => item.sourceIds),
    ...plan.relations.flatMap((item) => item.sourceIds),
  ]);
  const touchedObjectIds = new Set(plan.objects.flatMap((item) => item.existingObjectId ? [item.existingObjectId] : []));
  const touchedRelationIds = new Set(plan.relations.flatMap((item) => item.existingRelationId ? [item.existingRelationId] : []));

  return sources.flatMap((source) => {
    const change = source.change;
    if (!change) return [];
    if (change.changeKind === 'exclusion') return [change.changeId];
    if (change.targetKind === 'object' && touchedObjectIds.has(change.targetId)
      && representedSourceIds.has(source.sourceId)) {
      const target = plan.objects.find((item) => item.existingObjectId === change.targetId);
      if (change.changeKind !== 'rejection' || target?.lifecycle !== 'active') return [change.changeId];
    }
    if (change.targetKind === 'relation' && touchedRelationIds.has(change.targetId)
      && representedSourceIds.has(source.sourceId)) return [change.changeId];
    if (change.targetKind === 'person' && representedSourceIds.has(source.sourceId)) return [change.changeId];
    return [];
  });
}

export const PersonVerificationFindingSchema = z.object({
  itemKey: z.string().min(1).max(80),
  fieldPath: z.string().min(1).max(200),
  code: z.enum(['unsupported_claim', 'wrong_subject', 'date_overprecision', 'counterevidence_ignored', 'generic_filler', 'invalid_reference', 'mode_violation', 'invented_unknown', 'other']),
  severity: z.enum(['blocking', 'qualify', 'minor']),
  explanation: boundedText(1_000),
  sourceIds: z.array(uuid).max(100),
  observationIds: z.array(uuid).max(100),
}).strict();

export const PersonVerificationOutputSchema = z.object({
  findings: z.array(PersonVerificationFindingSchema).max(500),
  acceptedItemKeys: z.array(z.string().min(1).max(80)).max(200),
  unresolvedQuestions: z.array(boundedText(500)).max(50),
}).strict().superRefine((output, ctx) => {
  const seen = new Set<string>();
  output.acceptedItemKeys.forEach((key, index) => {
    if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedItemKeys', index], message: 'Accepted item keys must be unique.' });
    seen.add(key);
  });
});
export type PersonVerificationOutput = z.infer<typeof PersonVerificationOutputSchema>;

export const PersonConsolidationStageSchema = z.enum(['extract', 'match_countercontext', 'reconcile', 'compose', 'verify', 'repair']);
export type PersonConsolidationStage = z.infer<typeof PersonConsolidationStageSchema>;

export const PersonVerifierReceiptSchema = z.object({
  version: z.string().min(1).max(80),
  findings: z.array(PersonVerificationFindingSchema).max(500),
  acceptedItemKeys: z.array(z.string().min(1).max(80)).max(200),
  unresolvedQuestions: z.array(boundedText(500)).max(50),
}).strict();

export const PERSON_GUIDANCE_VERSION = 'person-consolidation-2026-09-23.v2';
export const PERSON_MODEL_POLICY_VERSION = 'person-consolidation-bounded.v1';

export class MalformedPersonStageOutputError extends Error {
  readonly code = 'malformed_stage_output';

  constructor(message: string) {
    super(message);
    this.name = 'MalformedPersonStageOutputError';
  }
}

export interface StageProviderMetadata {
  provider: string | null;
  model: string | null;
}

type ProviderCall = (options: ChatCompletionOptions) => Promise<ChatCompletionResult>;

const baseObjectParameters = {
  type: 'object',
  additionalProperties: false,
} as const;

export function schemaFor(stage: PersonConsolidationStage): z.ZodTypeAny {
  switch (stage) {
    case 'extract': return PersonExtractionOutputSchema;
    case 'match_countercontext': return PersonMatchOutputSchema;
    case 'reconcile': return PersonReconciliationOutputSchema;
    case 'compose':
    case 'repair': return PersonCompositionPlanSchema;
    case 'verify':
      return PersonVerificationOutputSchema;
  }
}

function zodSchemaToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const definition = (schema as any)._def as Record<string, any>;
  const typeName = String(definition.typeName);
  switch (typeName) {
    case 'ZodEffects': return zodSchemaToJsonSchema(definition.schema);
    case 'ZodDefault':
    case 'ZodOptional': return zodSchemaToJsonSchema(definition.innerType);
    case 'ZodNullable': return { anyOf: [zodSchemaToJsonSchema(definition.innerType), { type: 'null' }] };
    case 'ZodString': {
      const output: Record<string, unknown> = { type: 'string' };
      for (const check of definition.checks as Array<Record<string, any>>) {
        if (check.kind === 'min') output.minLength = check.value;
        if (check.kind === 'max') output.maxLength = check.value;
        if (check.kind === 'email') output.format = 'email';
        if (check.kind === 'uuid') output.format = 'uuid';
        if (check.kind === 'datetime') output.format = 'date-time';
        if (check.kind === 'date') output.format = 'date';
        if (check.kind === 'regex') output.pattern = check.regex.source;
      }
      return output;
    }
    case 'ZodNumber': {
      const output: Record<string, unknown> = { type: 'number' };
      for (const check of definition.checks as Array<Record<string, any>>) {
        if (check.kind === 'int') output.type = 'integer';
        if (check.kind === 'min') output[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        if (check.kind === 'max') output[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
      }
      return output;
    }
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodNull': return { type: 'null' };
    case 'ZodEnum': return { type: 'string', enum: definition.values };
    case 'ZodNativeEnum': return { enum: Object.values(definition.values).filter((value) => typeof value !== 'number') };
    case 'ZodLiteral': return { const: definition.value };
    case 'ZodArray': {
      const output: Record<string, unknown> = { type: 'array', items: zodSchemaToJsonSchema(definition.type) };
      if (definition.minLength) output.minItems = definition.minLength.value;
      if (definition.maxLength) output.maxItems = definition.maxLength.value;
      return output;
    }
    case 'ZodObject': {
      const shape = definition.shape() as Record<string, z.ZodTypeAny>;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodSchemaToJsonSchema(value);
        if (!['ZodOptional', 'ZodDefault'].includes(String((value as any)._def.typeName))) required.push(key);
      }
      const output: Record<string, unknown> = {
        type: 'object', properties, additionalProperties: definition.unknownKeys !== 'strict',
      };
      if (required.length) output.required = required;
      if (definition.unknownKeys === 'strict') output.additionalProperties = false;
      return output;
    }
    case 'ZodDiscriminatedUnion':
    case 'ZodUnion': {
      const options = definition.options instanceof Map ? [...definition.options.values()] : definition.options;
      return { anyOf: (options as z.ZodTypeAny[]).map(zodSchemaToJsonSchema) };
    }
    case 'ZodRecord': return { type: 'object', additionalProperties: zodSchemaToJsonSchema(definition.valueType) };
    case 'ZodUnknown':
    case 'ZodAny': return {};
    default: throw new Error(`Unsupported provider tool schema node: ${typeName}`);
  }
}

const stageDescriptions: Record<PersonConsolidationStage, Record<string, string>> = {
  extract: { observations: 'Source-grounded assertions with exact quote spans and explicit subject attribution.', unknowns: 'Material unresolved questions tied to a supplied source.' },
  match_countercontext: { matches: 'One ordered match decision for each extracted observation.', countercontextObservationIds: 'Prior observation UUIDs relevant as possible counterevidence.' },
  reconcile: { decisions: 'One ordered evidence disposition per observation, including qualified counterexamples.', unresolvedQuestions: 'Open questions that prevent stronger conclusions.' },
  compose: { objects: 'Typed object-version changes with only supplied source and observation references.', relations: 'Typed relation changes among existing or planned object IDs.', brief: 'A concise derived view, separately gated by verification.', decisionSummary: 'Evidence-based summary of this publication decision.', changedKeys: 'Keys of changed objects and relations.', unresolvedQuestions: 'Unresolved questions retained with the revision.' },
  verify: { findings: 'Field-level source, attribution, temporal, counterevidence, and mode findings.', acceptedItemKeys: 'Only item keys that pass verification; include brief only if its content is independently supported.', unresolvedQuestions: 'Remaining uncertainty requiring clarification.' },
  repair: { objects: 'Complete revised object plan after applying verifier findings.', relations: 'Complete revised relation plan.', brief: 'Revised derived view, only when supported.', decisionSummary: 'Updated evidence decision summary.', changedKeys: 'Updated changed-item keys.', unresolvedQuestions: 'Questions that still cannot be resolved.' },
};

export function personStageToolParameters(stage: PersonConsolidationStage): Record<string, unknown> {
  const output = zodSchemaToJsonSchema(schemaFor(stage));
  const properties = output.properties as Record<string, Record<string, unknown>> | undefined;
  for (const [field, description] of Object.entries(stageDescriptions[stage])) {
    if (properties?.[field]) properties[field] = { ...properties[field], description };
  }
  return { ...output, description: `Strict structured output for the ${stage} stage.` };
}

/**
 * Every generative stage returns through one exact function/tool call. Go's
 * Responses adapter only permits automatic tool selection, so the result is
 * parsed and validated here instead of trusting provider-side enforcement.
 */
export async function callPersonStage<T = unknown>(input: {
  stage: PersonConsolidationStage;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  system: string;
  content: string;
  maxTokens?: number;
  model?: string;
  sessionId?: string;
  responseMode?: 'tool' | 'json';
  providerCall?: ProviderCall;
}): Promise<{ value: T; metadata: StageProviderMetadata }> {
  const schema = schemaFor(input.stage);
  const tool: FunctionToolDefinition = {
    type: 'function',
    function: { name: input.toolName, description: input.description, parameters: input.parameters },
  };
  const call = input.providerCall ?? chatCompletion;
  const responseMode = input.responseMode ?? 'tool';
  const jsonBudget = input.stage === 'compose' || input.stage === 'repair'
    ? 'Create at most 6 high-value objects and at most 8 relations. Keep brief under 1200 characters.'
    : 'Keep the result concise and include only evidence needed by this stage.';
  const response = await call({
    model: input.model,
    messages: [
      {
        role: 'system',
        content: responseMode === 'json'
          ? `${input.system}\nReturn exactly one JSON object and no prose, markdown, or reasoning.`
          : input.system,
      },
      {
        role: 'user',
        content: responseMode === 'json'
          ? JSON.stringify({
              instruction: jsonBudget,
              jsonSchema: input.parameters,
              input: JSON.parse(input.content),
            })
          : input.content,
      },
    ],
    ...(responseMode === 'tool' ? { tools: [tool] } : {}),
    // OpenCode Go normalizes this to auto; exact tool name is checked below.
    ...(responseMode === 'tool' ? { toolChoice: { name: input.toolName } as const } : {}),
    sessionId: input.sessionId,
    temperature: 0,
    maxTokens: input.maxTokens ?? 4_000,
    // Consolidation stages return larger strict objects than foreground chat.
    // They are one-shot, so allow the provider's bounded maximum. The caller
    // supplies a fresh routing session per durable-step attempt.
    timeoutMs: 120_000,
  });
  const message = response.choices[0]?.message;
  const calls = message?.tool_calls ?? [];
  let raw: string;
  if (calls.length === 1 && calls[0]?.function.name === input.toolName) {
    raw = calls[0].function.arguments;
  } else if (calls.length === 0 && message?.content) {
    // Go only supports automatic tool choice. Some routed models emit the
    // requested strict object as the entire response instead of a function
    // call; accept only whole-response JSON (optionally one JSON fence).
    const trimmed = message.content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    raw = fenced?.[1] ?? trimmed;
  } else {
    throw new MalformedPersonStageOutputError('Provider did not return the single expected stage result.');
  }
  if (raw.length > 100_000) throw new MalformedPersonStageOutputError('Provider stage output exceeded the size limit.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new MalformedPersonStageOutputError('Provider stage output was not valid whole-response JSON.');
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new MalformedPersonStageOutputError('Provider stage output did not match its strict schema.');
  }
  return {
    value: parsed.data as T,
    metadata: { provider: response.provider ?? null, model: response.model ?? null },
  };
}

/** Reject a fabricated/mismatched quote before it becomes durable evidence. */
export function validateObservationSpans(
  sources: readonly ConsolidationSource[],
  observations: readonly PersonObservationDraft[],
): void {
  const byId = new Map(sources.map((source) => [source.sourceId, source]));
  for (const observation of observations) {
    const source = byId.get(observation.sourceId);
    if (!source) throw new MalformedPersonStageOutputError('Observation referenced a source outside the current chunk.');
    if (observation.spanStart === null || observation.spanEnd === null || observation.exactQuote === null) {
      throw new MalformedPersonStageOutputError('Observation requires a resolvable evidence span.');
    }
    if (observation.spanEnd > source.body.length || source.body.slice(observation.spanStart, observation.spanEnd) !== observation.exactQuote) {
      throw new MalformedPersonStageOutputError('Observation quote did not match its source span.');
    }
  }
}

/**
 * Correct a provider's harmless offset drift without weakening provenance.
 * The quoted text itself must already occur exactly once in the claimed source;
 * missing or ambiguous quotes remain hard failures.
 */
export function normalizeObservationSpans<T extends PersonObservationDraft>(
  sources: readonly ConsolidationSource[],
  observations: readonly T[],
): T[] {
  const byId = new Map(sources.map((source) => [source.sourceId, source]));
  return observations.map((observation) => {
    const source = byId.get(observation.sourceId);
    if (!source) throw new MalformedPersonStageOutputError('Observation referenced a source outside the current chunk.');
    if (observation.spanStart === null || observation.spanEnd === null || observation.exactQuote === null) {
      throw new MalformedPersonStageOutputError('Observation requires a resolvable evidence span.');
    }
    if (source.body.slice(observation.spanStart, observation.spanEnd) === observation.exactQuote) return observation;

    const first = source.body.indexOf(observation.exactQuote);
    if (first < 0 || source.body.indexOf(observation.exactQuote, first + 1) >= 0) {
      throw new MalformedPersonStageOutputError('Observation quote did not uniquely match its source.');
    }
    return {
      ...observation,
      spanStart: first,
      spanEnd: first + observation.exactQuote.length,
    };
  });
}

/** Each retrieved counterexample must be explicitly assessed by reconciliation. */
export function validateCountercontextCoverage(
  countercontext: readonly CountercontextItem[],
  reconciliation: PersonReconciliationOutput,
): void {
  const assessed = new Set(reconciliation.decisions.flatMap((decision) =>
    decision.counterevidence.map((item) => item.observationId)));
  const missing = countercontext.filter((item) => item.status !== 'rejected' && !assessed.has(item.observationId));
  if (missing.length > 0) {
    throw new MalformedPersonStageOutputError('Reconciliation did not explicitly assess all eligible countercontext.');
  }
}

/** No model judgment is needed when there is no prior graph or evidence. */
export function coldStartMatchAndReconciliation(observationCount: number): {
  match: PersonMatchOutput;
  reconciliation: PersonReconciliationOutput;
} {
  const indexes = Array.from({ length: observationCount }, (_, index) => index);
  return {
    match: PersonMatchOutputSchema.parse({
      matches: indexes.map((observationIndex) => ({
        observationIndex,
        targetObjectId: null,
        matchKind: 'no_match',
        rationale: 'No prior person-model object exists for a cold-start match.',
      })),
      countercontextObservationIds: [],
    }),
    reconciliation: PersonReconciliationOutputSchema.parse({
      decisions: indexes.map((observationIndex) => ({
        observationIndex,
        disposition: 'new',
        rationale: 'No prior observation or object exists to reconcile against.',
        counterevidence: [],
      })),
      unresolvedQuestions: [],
    }),
  };
}

export function validateVerificationReferences(
  plan: PersonCompositionPlan,
  verification: PersonVerificationOutput,
  sourceIds: readonly string[],
  observationIds: readonly string[],
): void {
  const itemKeys = new Set(['brief', ...plan.objects.map((item) => item.key), ...plan.relations.map((item) => item.key)]);
  const sources = new Set(sourceIds);
  const observations = new Set(observationIds);
  for (const key of verification.acceptedItemKeys) {
    if (!itemKeys.has(key)) throw new MalformedPersonStageOutputError('Verifier accepted an unknown composition item.');
  }
  for (const finding of verification.findings) {
    if (!itemKeys.has(finding.itemKey)) throw new MalformedPersonStageOutputError('Verifier finding referenced an unknown composition item.');
    if (finding.sourceIds.some((id) => !sources.has(id)) || finding.observationIds.some((id) => !observations.has(id))) {
      throw new MalformedPersonStageOutputError('Verifier finding referenced evidence outside the supplied context.');
    }
  }
}

/**
 * Preserve only verifier-accepted plan items. A blocking finding always wins
 * over a model's accepted list; unresolved items remain available as gaps.
 */
export function verifiedCompositionSubset(
  plan: PersonCompositionPlan,
  verification: PersonVerificationOutput,
): PersonCompositionPlan {
  const relationKeys = new Set(plan.relations.map((item) => item.key));
  const planKeys = new Set([...plan.objects.map((item) => item.key), ...relationKeys, 'brief']);
  for (const key of verification.acceptedItemKeys) {
    if (!planKeys.has(key)) throw new MalformedPersonStageOutputError('Verifier accepted an unknown composition item.');
  }
  const blocking = new Set(verification.findings
    .filter((finding) => finding.severity === 'blocking')
    .map((finding) => finding.itemKey));
  const accepted = new Set(verification.acceptedItemKeys.filter((key) => !blocking.has(key)));
  const objects = plan.objects.filter((object) => accepted.has(object.key));
  const acceptedRelationKeys = new Set([...accepted].filter((key) => relationKeys.has(key)));
  const keys = new Set(objects.map((object) => object.key));
  const relations = plan.relations.filter((relation) => acceptedRelationKeys.has(relation.key)
    && (relation.from.kind === 'existing' || keys.has(relation.from.key))
    && (relation.to.kind === 'existing' || keys.has(relation.to.key)));
  return PersonCompositionPlanSchema.parse({
    ...plan,
    objects,
    relations,
    // A free-form narrative is separately verifier-gated; never publish an
    // unchecked summary merely because some structured items were accepted.
    brief: accepted.has('brief') && !blocking.has('brief') ? plan.brief : '',
    unresolvedQuestions: [...new Set([
      ...plan.unresolvedQuestions,
      ...verification.unresolvedQuestions,
      ...(plan.objects.some((item) => !accepted.has(item.key)) || plan.relations.some((item) => !accepted.has(item.key))
        ? ['Some proposed items were not accepted by verification and remain unresolved.'] : []),
    ])].slice(0, 50),
  });
}

/** Generic JSON Schema envelope for providers that support function tools. */
export function strictObjectParameters(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { ...baseObjectParameters, properties, required };
}
