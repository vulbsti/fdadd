import { z } from 'zod';

const uuidSchema = z.string().uuid();
const nonEmpty = (max = 2_000) => z.string().trim().min(1).max(max);
const isoTimestamp = z.string().datetime({ offset: true });
const isoDate = z.string().date();
export const PersonObjectKindSchema = z.enum([
  'episode',
  'meaning_change',
  'pattern',
  'influence',
  'goal',
  'issue',
  'current_state',
  'gap',
  'scenario',
  'chapter',
]);
export type PersonObjectKind = z.infer<typeof PersonObjectKindSchema>;

export const PersonRelationKindSchema = z.enum([
  'precedes',
  'reported_effect',
  'changed_meaning',
  'supports',
  'qualifies',
  'contradicts',
  'influenced',
  'part_of',
  'hypothesized_link',
]);
export type PersonRelationKind = z.infer<typeof PersonRelationKindSchema>;

export const EpistemicClassSchema = z.enum(['reported', 'working_hypothesis', 'unknown']);
export type EpistemicClass = z.infer<typeof EpistemicClassSchema>;

/** Lifecycle values accepted by persisted object and relation versions. */
export const LifecycleSchema = z.enum(['active', 'superseded', 'retired', 'invalidated']);
export const PersonVersionLifecycleSchema = LifecycleSchema;
export const TimeRangeSchema = z.object({
  precision: z.enum(['exact', 'day', 'month', 'year', 'range', 'age', 'relative', 'approximate', 'unknown']),
  start: z.union([isoDate, isoTimestamp]).nullable(),
  end: z.union([isoDate, isoTimestamp]).nullable(),
  age: z.number().int().min(0).max(130).nullable(),
  note: z.string().max(500).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.precision === 'unknown' && (value.start || value.end || value.age !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown time cannot claim date or age bounds.' });
  }
  if (value.end && value.start && Date.parse(value.end) < Date.parse(value.start)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Time range end must not precede start.' });
  }
});
export type TimeRange = z.infer<typeof TimeRangeSchema>;

const episodePayload = z.object({
  kind: z.literal('episode'),
  title: nonEmpty(180),
  event: nonEmpty(2_000),
  setting: z.string().max(1_000).nullable(),
  people: z.array(z.string().trim().min(1).max(180)).max(30),
  reportedExperience: z.string().max(2_000).nullable(),
  reportedEffects: z.array(z.string().trim().min(1).max(500)).max(20),
  unresolvedInterpretation: z.string().max(1_000).nullable(),
  occurred: TimeRangeSchema,
}).strict();

const meaningChangePayload = z.object({
  kind: z.literal('meaning_change'),
  title: nonEmpty(180),
  priorMeaning: nonEmpty(1_000),
  challengingExperience: nonEmpty(1_500),
  laterMeaning: z.string().max(1_000).nullable(),
  laterMeaningStatus: z.enum(['reported', 'unknown', 'not_yet_shared']),
  effectivePeriod: TimeRangeSchema,
}).strict();

const patternPayload = z.object({
  kind: z.literal('pattern'),
  title: nonEmpty(180),
  triggerOrContext: nonEmpty(1_000),
  expectationOrAttention: z.string().max(1_000).nullable(),
  response: nonEmpty(1_000),
  reportedConsequence: z.string().max(1_000).nullable(),
  supportingEpisodeIds: z.array(uuidSchema).max(100),
  exceptions: z.array(z.string().trim().min(1).max(500)).max(30),
  alternativeExplanations: z.array(z.string().trim().min(1).max(500)).max(20),
  scope: z.string().max(300).nullable(),
  observedDuring: TimeRangeSchema,
}).strict();

const influencePayload = z.object({
  kind: z.literal('influence'),
  title: nonEmpty(180),
  subjectPersonId: uuidSchema.nullable(),
  entityAsDescribed: nonEmpty(500),
  relationshipLabelAsReported: z.string().max(180).nullable(),
  experiencedInfluence: nonEmpty(1_200),
  connectedEpisodeIds: z.array(uuidSchema).max(100),
}).strict();

const goalPayload = z.object({
  kind: z.literal('goal'),
  title: nonEmpty(180),
  statedOutcome: nonEmpty(1_000),
  underlyingValue: z.string().max(800).nullable(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned', 'unclear']),
  timeframe: TimeRangeSchema,
  purpose: z.string().max(800).nullable(),
}).strict();

const issuePayload = z.object({
  kind: z.literal('issue'),
  title: nonEmpty(180),
  presentRelevance: nonEmpty(1_000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(30),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(30),
  status: z.enum(['active', 'monitoring', 'resolved', 'unclear']),
  framing: z.enum(['reported', 'working_hypothesis', 'unknown']),
}).strict();

const currentStatePayload = z.object({
  kind: z.literal('current_state'),
  title: nonEmpty(180),
  domain: nonEmpty(120),
  summary: nonEmpty(1_500),
  asOf: isoTimestamp,
  freshness: z.enum(['current', 'needs_review', 'stale', 'unknown']),
  openChecks: z.array(z.string().trim().min(1).max(500)).max(30),
}).strict();

const gapPayload = z.object({
  kind: z.literal('gap'),
  title: nonEmpty(180),
  distinction: nonEmpty(800),
  whyItMatters: nonEmpty(800),
  blockedInterpretationOrDecision: z.string().max(800).nullable(),
  candidateQuestion: z.string().max(500).nullable(),
  status: z.enum(['open', 'partially_resolved', 'resolved', 'not_relevant']),
}).strict();

const scenarioPayload = z.object({
  kind: z.literal('scenario'),
  title: nonEmpty(180),
  currentState: nonEmpty(800),
  goalIds: z.array(uuidSchema).max(30),
  conditions: z.array(z.string().trim().min(1).max(500)).max(30),
  possibleDevelopment: nonEmpty(1_000),
  counterconditions: z.array(z.string().trim().min(1).max(500)).max(30),
  observableSigns: z.array(z.string().trim().min(1).max(500)).max(30),
  uncertainty: nonEmpty(500),
  horizon: TimeRangeSchema,
}).strict();

const chapterPayload = z.object({
  kind: z.literal('chapter'),
  title: nonEmpty(180),
  memberObjectIds: z.array(uuidSchema).min(1).max(200),
  theme: nonEmpty(1_000),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(30),
}).strict();

export const PersonObjectPayloadSchema = z.discriminatedUnion('kind', [
  episodePayload,
  meaningChangePayload,
  patternPayload,
  influencePayload,
  goalPayload,
  issuePayload,
  currentStatePayload,
  gapPayload,
  scenarioPayload,
  chapterPayload,
]).superRefine((value, ctx) => {
  if (value.kind !== 'meaning_change') return;
  if (value.laterMeaningStatus === 'reported' && !value.laterMeaning) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['laterMeaning'], message: 'Reported later meaning requires reported content.' });
  }
  if (value.laterMeaningStatus !== 'reported' && value.laterMeaning !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['laterMeaning'], message: 'Unknown or unshared meaning must not contain invented content.' });
  }
});
export type PersonObjectPayload = z.infer<typeof PersonObjectPayloadSchema>;

export const PersonDependencySchema = z.object({
  kind: z.enum([
    'source', 'observation', 'object_version', 'relation_version', 'suggestion_version',
    'person_revision', 'birth_revision', 'calculation_revision', 'mode_epoch', 'privacy_epoch',
  ]),
  id: z.string().trim().min(1).max(200),
  version: z.number().int().nonnegative().nullable().default(null),
}).strict();
export type PersonDependency = z.infer<typeof PersonDependencySchema>;

export const PersonObjectVersionSchema = z.object({
  id: uuidSchema,
  objectId: uuidSchema,
  personId: uuidSchema,
  revision: z.number().int().nonnegative(),
  payload: PersonObjectPayloadSchema,
  epistemicClass: EpistemicClassSchema,
  lifecycle: LifecycleSchema,
  effectiveTime: TimeRangeSchema,
  sourceIds: z.array(uuidSchema).max(200),
  observationIds: z.array(uuidSchema).max(200),
  dependencies: z.array(PersonDependencySchema).max(500),
  createdAt: isoTimestamp,
}).strict();
export type PersonObjectVersion = z.infer<typeof PersonObjectVersionSchema>;

export const PersonRelationVersionSchema = z.object({
  id: uuidSchema,
  relationId: uuidSchema,
  personId: uuidSchema,
  revision: z.number().int().nonnegative(),
  kind: PersonRelationKindSchema,
  fromObjectId: uuidSchema,
  toObjectId: uuidSchema,
  epistemicClass: EpistemicClassSchema,
  rationale: z.string().max(1_000).nullable(),
  sourceIds: z.array(uuidSchema).max(200),
  observationIds: z.array(uuidSchema).max(200),
  dependencies: z.array(PersonDependencySchema).max(500),
  createdAt: isoTimestamp,
}).strict();
export type PersonRelationVersion = z.infer<typeof PersonRelationVersionSchema>;

export const PersonReadinessSchema = z.object({
  person: z.enum(['ready', 'pending', 'unavailable']),
  astrology: z.enum(['not_configured', 'pending', 'ready', 'failed', 'disabled']),
  level: z.enum(['name_only', 'personal_model', 'astrology_ready']),
  explanation: z.string().max(500),
}).strict();

export const PersonIdentitySchema = z.object({
  personId: uuidSchema,
  ownerId: uuidSchema,
  name: nonEmpty(180),
  personStatus: z.enum(['active', 'archived', 'deleting', 'deleted']),
  astroStatus: z.enum(['not_configured', 'pending', 'ready', 'failed', 'disabled']),
  readiness: PersonReadinessSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
}).strict();
export type PersonIdentity = z.infer<typeof PersonIdentitySchema>;

export const PersonModelHeadSchema = z.object({
  personId: uuidSchema,
  currentRevision: z.number().int().positive(),
  sourceWatermark: z.number().int().nonnegative(),
  privacyEpoch: z.number().int().nonnegative(),
  modeEpoch: z.number().int().nonnegative(),
  publicationState: z.enum(['empty', 'current', 'stale', 'blocked', 'deleting']),
  updatedAt: isoTimestamp,
}).strict();
export type PersonModelHead = z.infer<typeof PersonModelHeadSchema>;

export const PersonSourceSchema = z.object({
  id: uuidSchema,
  personId: uuidSchema,
  sourceSeq: z.number().int().positive(),
  kind: z.enum(['native_message', 'explicit_correction', 'explicit_exclusion', 'import_item', 'other']),
  speaker: z.enum(['user', 'assistant', 'tool', 'system', 'unknown']),
  subjectKind: z.enum(['self', 'other', 'hypothetical', 'unknown']),
  subjectLabel: z.string().max(180).nullable(),
  sourceTime: isoTimestamp.nullable(),
  ingestedAt: isoTimestamp,
  originalOrder: z.number().int().nonnegative().nullable(),
  inclusion: z.enum(['included', 'excluded', 'pending', 'retracted']),
  sourceMessageId: uuidSchema.nullable(),
  dedupKey: z.string().max(200).nullable(),
  lineage: z.record(z.string(), z.unknown()),
}).strict();
export type PersonSource = z.infer<typeof PersonSourceSchema>;

export const PersonObservationSchema = z.object({
  id: uuidSchema,
  personId: uuidSchema,
  sourceId: uuidSchema,
  spanStart: z.number().int().nonnegative().nullable(),
  spanEnd: z.number().int().nonnegative().nullable(),
  exactQuote: z.string().max(2_000).nullable(),
  normalizedAssertion: z.record(z.string(), z.unknown()),
  subjectKind: z.enum(['self', 'other', 'hypothetical', 'unknown']),
  subjectLabel: z.string().max(180).nullable(),
  domain: z.string().max(80),
  eventTime: TimeRangeSchema,
  assertionType: z.enum(['direct', 'derived', 'reported_interpretation', 'assistant_hypothesis', 'unknown']),
  status: z.enum(['proposed', 'verified', 'rejected', 'superseded']),
  extractorVersion: z.string().max(120).nullable(),
  verifierVersion: z.string().max(120).nullable(),
  createdAt: isoTimestamp,
}).strict().superRefine((value, ctx) => {
  if (value.spanStart !== null && value.spanEnd !== null && value.spanEnd < value.spanStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Observation span end must not precede start.' });
  }
});
export type PersonObservation = z.infer<typeof PersonObservationSchema>;

export const PersonChangeSchema = z.object({
  id: uuidSchema,
  personId: uuidSchema,
  sourceId: uuidSchema,
  sourceSeq: z.number().int().positive(),
  commandId: uuidSchema.nullable(),
  kind: z.enum(['correction', 'rejection', 'exclusion', 'inclusion', 'deletion', 'merge', 'split']),
  targetKind: z.enum(['object', 'relation', 'source', 'person']),
  targetId: uuidSchema,
  priorVersionId: uuidSchema.nullable(),
  status: z.enum(['accepted', 'resolved', 'cancelled']),
  resolvedRevision: z.number().int().positive().nullable(),
  request: z.record(z.string(), z.unknown()),
  invalidatedIds: z.array(uuidSchema).max(500),
  createdAt: isoTimestamp,
}).strict();
export type PersonChange = z.infer<typeof PersonChangeSchema>;

const AddEventChangeSchema = z.object({
  kind: z.literal('add_event'),
  payload: episodePayload,
}).strict();
const CorrectAccountChangeSchema = z.object({
  kind: z.literal('correct_account'),
  targetObjectId: uuidSchema,
  payload: PersonObjectPayloadSchema,
}).strict();
const RejectInterpretationChangeSchema = z.object({
  kind: z.literal('reject_interpretation'),
  targetObjectId: uuidSchema,
  explanation: nonEmpty(1_000),
}).strict();
const AddMeaningChangeSchema = z.object({
  kind: z.literal('add_meaning'),
  payload: meaningChangePayload,
}).strict();
const ExcludeSourceChangeSchema = z.object({
  kind: z.literal('exclude_source'),
  sourceId: uuidSchema,
}).strict();

/** Exact user intent payload accepted by person_submit_change. */
export const PersonChangeRequestSchema = z.discriminatedUnion('kind', [
  AddEventChangeSchema,
  CorrectAccountChangeSchema,
  RejectInterpretationChangeSchema,
  AddMeaningChangeSchema,
  ExcludeSourceChangeSchema,
]);
export type PersonChangeRequest = z.infer<typeof PersonChangeRequestSchema>;

export const SubmitPersonChangeInputSchema = z.object({
  personId: uuidSchema,
  commandId: uuidSchema,
  expectedRevision: z.number().int().positive().nullable(),
  change: PersonChangeRequestSchema,
}).strict();
export type SubmitPersonChangeInput = z.infer<typeof SubmitPersonChangeInputSchema>;

export const PersonChangeReceiptSchema = z.object({
  changeId: uuidSchema,
  personId: uuidSchema,
  sourceId: uuidSchema,
  sourceSeq: z.number().int().positive(),
  commandId: uuidSchema,
  kind: z.enum(['correction', 'rejection', 'exclusion', 'inclusion']),
  targetKind: z.enum(['object', 'relation', 'source', 'person']),
  targetId: uuidSchema,
  priorVersionId: uuidSchema.nullable(),
  status: z.literal('accepted'),
  resolvedRevision: z.number().int().positive().nullable(),
  request: z.record(z.string(), z.unknown()),
  invalidatedIds: z.array(uuidSchema).max(500),
  expectedRevision: z.number().int().positive().nullable(),
  jobId: uuidSchema,
  createdAt: isoTimestamp,
  replayed: z.boolean(),
}).strict();
export type PersonChangeReceipt = z.infer<typeof PersonChangeReceiptSchema>;

export const AcceptUserMessageInputSchema = z.object({
  personId: uuidSchema,
  messageId: uuidSchema,
  commandId: uuidSchema,
}).strict();
export type AcceptUserMessageInput = z.infer<typeof AcceptUserMessageInputSchema>;

export const AcceptedUserMessageSchema = z.object({
  personId: uuidSchema,
  sourceId: uuidSchema,
  sourceSeq: z.number().int().positive(),
  jobId: uuidSchema,
  alreadyAccepted: z.boolean(),
  replayed: z.boolean(),
}).strict();
export type AcceptedUserMessage = z.infer<typeof AcceptedUserMessageSchema>;

/** Input format consumed by the fenced person_record_observations RPC. */
export const PersonObservationDraftBaseSchema = z.object({
  sourceId: uuidSchema,
  spanStart: z.number().int().nonnegative().nullable(),
  spanEnd: z.number().int().nonnegative().nullable(),
  exactQuote: z.string().max(2_000).nullable(),
  normalizedAssertion: nonEmpty(2_000),
  // Attribution is an explicit extraction result. A null subject ID must not
  // silently become "self": the statement may concern a parent, a quoted
  // speaker, a hypothetical person, or be genuinely ambiguous.
  subjectKind: z.enum(['self', 'other', 'hypothetical', 'unknown']),
  subjectLabel: z.string().max(180).nullable(),
  subjectPersonId: uuidSchema.nullable(),
  domain: z.string().max(80),
  assertionType: z.enum(['direct', 'derived', 'reported_interpretation', 'assistant_hypothesis', 'unknown', 'question', 'correction']),
  eventTime: TimeRangeSchema,
  extractorVersion: nonEmpty(120),
  verifierVersion: z.string().max(120).nullable(),
}).strict();

export const PersonObservationDraftSchema = PersonObservationDraftBaseSchema.superRefine((value, ctx) => {
  if (value.spanStart !== null && value.spanEnd !== null && value.spanEnd < value.spanStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Observation span end must not precede start.' });
  }
});
export type PersonObservationDraft = z.infer<typeof PersonObservationDraftSchema>;

export const RecordPersonObservationsInputSchema = z.object({
  jobId: uuidSchema,
  leaseToken: uuidSchema,
  fence: z.number().int().nonnegative(),
  observations: z.array(PersonObservationDraftSchema).min(1).max(500),
}).strict();
export type RecordPersonObservationsInput = z.infer<typeof RecordPersonObservationsInputSchema>;

export const PersonViewKeySchema = z.enum([
  'life_map', 'chapters', 'patterns', 'people', 'paths', 'chapter_detail', 'object_detail',
]);
export type PersonViewKey = z.infer<typeof PersonViewKeySchema>;

export const RecordPersonCorrectionInputSchema = z.object({
  personId: uuidSchema,
  messageId: uuidSchema,
  targetObjectId: uuidSchema,
  commandId: uuidSchema,
}).strict();
export type RecordPersonCorrectionInput = z.infer<typeof RecordPersonCorrectionInputSchema>;

export const PersonCorrectionReceiptSchema = z.object({
  personId: uuidSchema,
  sourceId: uuidSchema,
  sourceSeq: z.number().int().positive(),
  changeId: uuidSchema,
  jobId: uuidSchema,
  invalidatedObjectId: uuidSchema,
  privacyEpoch: z.number().int().nonnegative(),
  replayed: z.boolean(),
}).strict();
export type PersonCorrectionReceipt = z.infer<typeof PersonCorrectionReceiptSchema>;

export const PersonJobSchema = z.object({
  id: uuidSchema,
  personId: uuidSchema,
  kind: z.enum(['source_consolidation', 'correction', 'exclusion', 'deletion', 'rebuild']),
  status: z.enum(['pending', 'leased', 'running', 'completed', 'failed', 'cancelled']),
  sourceFromSeq: z.number().int().positive(),
  sourceToSeq: z.number().int().positive(),
  baseRevision: z.number().int().positive(),
  privacyEpoch: z.number().int().nonnegative(),
  modeEpoch: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  availableAt: isoTimestamp,
  resultRevision: z.number().int().positive().nullable(),
  lastErrorCode: z.string().max(100).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
}).strict();
export type PersonJob = z.infer<typeof PersonJobSchema>;

export const RebasePersonJobInputSchema = z.object({
  jobId: uuidSchema,
  leaseToken: uuidSchema,
  fence: z.number().int().nonnegative(),
}).strict();
export type RebasePersonJobInput = z.infer<typeof RebasePersonJobInputSchema>;

export const RebasePersonJobResultSchema = z.union([
  z.object({
    status: z.literal('pending'),
    jobId: uuidSchema,
    baseRevision: z.number().int().positive(),
    sourceFromSeq: z.number().int().positive(),
    sourceToSeq: z.number().int().positive(),
    fence: z.number().int().nonnegative(),
    rebaseCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    status: z.literal('completed'),
    jobId: uuidSchema,
    resultRevision: z.number().int().positive(),
    superseded: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal('cancelled'),
    reason: z.literal('epoch_changed'),
    jobId: uuidSchema,
    currentRevision: z.number().int().positive(),
  }).strict(),
  z.object({
    status: z.literal('cancelled'),
    reason: z.literal('source_range_ineligible'),
    jobId: uuidSchema,
    sourceFromSeq: z.number().int().positive(),
    sourceToSeq: z.number().int().positive(),
  }).strict(),
]);
export type RebasePersonJobResult = z.infer<typeof RebasePersonJobResultSchema>;

export const PersonRevisionSchema = z.object({
  personId: uuidSchema,
  revision: z.number().int().positive(),
  parentRevision: z.number().int().positive().nullable(),
  sourceWatermark: z.number().int().nonnegative(),
  privacyEpoch: z.number().int().nonnegative(),
  modeEpoch: z.number().int().nonnegative(),
  schemaVersion: nonEmpty(80),
  guidanceVersion: z.string().max(120).nullable(),
  modelPolicyVersion: z.string().max(120).nullable(),
  jobId: uuidSchema.nullable(),
  commitId: uuidSchema,
  changedIds: z.array(z.string().min(1).max(200)).max(1_000),
  decisionSummary: z.string().max(4_000),
  brief: z.string().max(10_000),
  verifierReceipt: z.record(z.string(), z.unknown()),
  createdAt: isoTimestamp,
}).strict();
export type PersonRevision = z.infer<typeof PersonRevisionSchema>;

export const PersonViewSchema = z.object({
  personRevision: z.number().int().nonnegative(),
  sourceWatermark: z.number().int().nonnegative(),
  mode: z.enum(['personal', 'astrology_enabled']),
  modeEpoch: z.number().int().nonnegative(),
  privacyEpoch: z.number().int().nonnegative(),
  updateState: z.enum(['current', 'stale', 'updating', 'blocked']),
  view: PersonViewKeySchema,
  objectId: uuidSchema.nullable(),
  title: z.string().max(180),
  nodes: z.array(z.object({ objectVersionId: uuidSchema, title: nonEmpty(180), kind: PersonObjectKindSchema, order: z.number().int().nonnegative() }).strict()).max(500),
  edges: z.array(z.object({ relationVersionId: uuidSchema, kind: PersonRelationKindSchema, fromObjectId: uuidSchema, toObjectId: uuidSchema }).strict()).max(1_000),
  explorationIds: z.array(uuidSchema).max(200),
  generatedAt: isoTimestamp,
}).strict();
export type PersonView = z.infer<typeof PersonViewSchema>;

export const PersonViewSnapshotInputSchema = z.object({
  viewKey: PersonViewKeySchema,
  snapshot: PersonViewSchema,
}).strict().superRefine((value, ctx) => {
  if (value.snapshot.view !== value.viewKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshot', 'view'], message: 'Snapshot view must match viewKey.' });
  }
});
export type PersonViewSnapshotInput = z.infer<typeof PersonViewSnapshotInputSchema>;

export const CreateNameOnlyPersonInputSchema = z.object({
  name: nonEmpty(120),
  idempotencyKey: uuidSchema,
}).strict();
export type CreateNameOnlyPersonInput = z.infer<typeof CreateNameOnlyPersonInputSchema>;

export const PersonPublicationCandidateSchema = z.object({
  processedSourceSeq: z.number().int().nonnegative(),
  objectMembers: z.array(z.object({ objectId: uuidSchema, versionId: uuidSchema }).strict()).max(500),
  relationMembers: z.array(z.object({ relationId: uuidSchema, versionId: uuidSchema }).strict()).max(1_000),
  conflictIds: z.array(uuidSchema).max(500),
  resolveChangeIds: z.array(uuidSchema).max(500),
  brief: z.string().max(12_000),
  changedIds: z.array(z.string().min(1).max(200)).max(1_000),
  decisionSummary: z.string().max(4_000),
  verifierReceipt: z.record(z.string(), z.unknown()),
  schemaVersion: z.string().max(80).optional(),
  guidanceVersion: z.string().max(120).nullable().optional(),
  modelPolicyVersion: z.string().max(120).nullable().optional(),
  viewSnapshots: z.array(PersonViewSnapshotInputSchema).max(7).optional(),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const [index, snapshot] of (value.viewSnapshots ?? []).entries()) {
    if (seen.has(snapshot.viewKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['viewSnapshots', index, 'viewKey'], message: 'A candidate may include at most one snapshot per view key.' });
    }
    seen.add(snapshot.viewKey);
    if (snapshot.snapshot.sourceWatermark !== value.processedSourceSeq) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['viewSnapshots', index, 'snapshot', 'sourceWatermark'], message: 'Snapshot watermark must match its publication candidate.' });
    }
  }
});
export type PersonPublicationCandidate = z.infer<typeof PersonPublicationCandidateSchema>;

/** Input contract for the exact fenced worker RPC; DB rechecks all state under lock. */
export const PublishPersonRevisionInputSchema = z.object({
  personId: uuidSchema,
  jobId: uuidSchema,
  leaseToken: uuidSchema,
  fence: z.number().int().nonnegative(),
  expectedBaseRevision: z.number().int().positive(),
  expectedPrivacyEpoch: z.number().int().nonnegative(),
  commitId: uuidSchema,
  candidate: PersonPublicationCandidateSchema,
}).strict().superRefine((value, ctx) => {
  for (const [index, snapshot] of (value.candidate.viewSnapshots ?? []).entries()) {
    if (snapshot.snapshot.personRevision !== value.expectedBaseRevision + 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidate', 'viewSnapshots', index, 'snapshot', 'personRevision'], message: 'Snapshot revision must be the revision published by this candidate.' });
    }
    if (snapshot.snapshot.privacyEpoch !== value.expectedPrivacyEpoch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidate', 'viewSnapshots', index, 'snapshot', 'privacyEpoch'], message: 'Snapshot privacy epoch must match the publisher fence.' });
    }
  }
});
export type PublishPersonRevisionInput = z.infer<typeof PublishPersonRevisionInputSchema>;

export const PersonRevisionPublicationResultSchema = z.object({
  personId: uuidSchema,
  revision: z.number().int().positive(),
  revisionId: uuidSchema.optional(),
  published: z.literal(true),
  replayed: z.boolean(),
}).strict();
export type PersonRevisionPublicationResult = z.infer<typeof PersonRevisionPublicationResultSchema>;

export const PersonStoreErrorCodeSchema = z.enum([
  'unauthenticated', 'not_owned_or_missing', 'conflict', 'stale_revision', 'mode_changed',
  'source_excluded', 'unconfigured', 'invalid_record', 'internal',
]);
export type PersonStoreErrorCode = z.infer<typeof PersonStoreErrorCodeSchema>;
