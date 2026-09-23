/**
 * Shared typed contracts for the durable astrologer agent system.
 *
 * Every database row crossing into application code, every model tool
 * argument, every API DTO, and every Workflow stream event is parsed through
 * these Zod schemas. Client-visible errors are always `{ code, message,
 * runId?, resumable? }`; operational details stay server-side.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const AgentErrorCode = [
  'not_found',
  'forbidden',
  'conflict',
  'stale_version',
  'quota_exceeded',
  'invalid_transition',
  'invalid_request',
  'unconfigured',
  'internal',
] as const;
export const agentErrorCodeSchema = z.enum(AgentErrorCode);
export type AgentErrorCode = (typeof AgentErrorCode)[number];

export const ApiErrorDtoSchema = z.object({
  code: agentErrorCodeSchema,
  message: z.string(),
  runId: z.string().uuid().optional(),
  resumable: z.boolean().optional(),
});
export type ApiErrorDto = z.infer<typeof ApiErrorDtoSchema>;

// ---------------------------------------------------------------------------
// Birth input / profile
// ---------------------------------------------------------------------------

export const BirthInputSchema = z.object({
  name: z.string().min(1).max(200),
  date: isoDateSchema,
  time: isoTimeSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(100),
  place_name: z.string().max(300).optional(),
  time_source: z.string().max(50).optional(),
  time_confidence: z.string().max(50).optional(),
});
export type BirthInput = z.infer<typeof BirthInputSchema>;

export const ProfileSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  initializationStatus: z.enum(['pending', 'ready', 'failed']),
  initializationError: z.string().nullable(),
  hasChart: z.boolean(),
  createdAt: z.string(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

// ---------------------------------------------------------------------------
// Messages / sessions
// ---------------------------------------------------------------------------

export const AstrologerMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
  runId: z.string().uuid().nullable(),
});
export type AstrologerMessage = z.infer<typeof AstrologerMessageSchema>;

export const FocusedQuestionOptionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  kind: z.enum(['answer', 'control']),
});
export type FocusedQuestionOption = z.infer<typeof FocusedQuestionOptionSchema>;

export const FocusedQuestionSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1).max(2000),
  responseKind: z.enum(['free_text', 'single_choice']),
  options: z.array(FocusedQuestionOptionSchema).max(12).default([]),
  allowFreeText: z.boolean().default(true),
});
export type FocusedQuestion = z.infer<typeof FocusedQuestionSchema>;

/** Rectification questions must offer exactly one control option. */
export function validateFocusedQuestion(question: FocusedQuestion): string | null {
  if (question.responseKind === 'single_choice' && question.options.length < 2) {
    return 'single_choice questions need at least two options';
  }
  const controlCount = question.options.filter((o) => o.kind === 'control').length;
  if (controlCount > 1) return 'at most one control option is allowed';
  return null;
}

export const AstrologerRunSummarySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['intake', 'question']),
  status: z.enum(['active', 'waiting_for_user', 'complete', 'failed']),
  phase: z.enum(['planning', 'retrieval', 'analysis', 'verification', 'responding']).nullable(),
  nextAction: z.string().nullable(),
  resumable: z.boolean(),
  resumeFromRunId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AstrologerRunSummary = z.infer<typeof AstrologerRunSummarySchema>;

/** Safe, bounded execution receipt; reasoning text is intentionally absent. */
export const AstrologerRunStepSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  stepKey: z.string(),
  kind: z.enum(['plan', 'retrieval', 'model', 'tool', 'verification', 'checkpoint']),
  status: z.enum(['started', 'succeeded', 'failed']),
  toolName: z.string().nullable(),
  inputSummary: z.string().nullable(),
  outputSummary: z.string().nullable(),
  refs: z.record(z.unknown()),
  cacheHit: z.boolean(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AstrologerRunStep = z.infer<typeof AstrologerRunStepSchema>;

export const AstrologerSessionSummarySchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  profileName: z.string().nullable(),
  title: z.string(),
  status: z.enum(['active', 'waiting_for_user', 'complete', 'failed']),
  currentQuestion: FocusedQuestionSchema.nullable(),
  nextAction: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  latestRun: AstrologerRunSummarySchema.nullable(),
  updatedAt: z.string(),
});
export type AstrologerSessionSummary = z.infer<typeof AstrologerSessionSummarySchema>;

export const AstrologerSessionDetailSchema = z.object({
  session: AstrologerSessionSummarySchema,
  profile: ProfileSummarySchema.nullable(),
  messages: z.array(AstrologerMessageSchema),
  latestRun: AstrologerRunSummarySchema.nullable(),
  trace: z.array(AstrologerRunStepSchema),
  nextCursor: z.string().nullable(),
});
export type AstrologerSessionDetail = z.infer<typeof AstrologerSessionDetailSchema>;

// ---------------------------------------------------------------------------
// Run plan / checkpoint / verification
// ---------------------------------------------------------------------------

const RunPlanStepBaseSchema = z.object({
  key: z.string().min(1).max(80),
  objective: z.string().min(1).max(500),
}).strict();

export const AtrosPlanCalculationSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('atros_chart'), args: z.object({}).strict() }).strict(),
  z.object({
    tool: z.literal('atros_sensitivity'),
    args: z.object({ offsets: z.array(z.number().int().min(-180).max(180)).max(25).optional() }).strict(),
  }).strict(),
  z.object({
    tool: z.literal('atros_timeline'),
    args: z.object({
      from: isoDateSchema,
      to: isoDateSchema,
      level: z.enum(['maha', 'antar', 'pratyantar', 'sookshma']).default('pratyantar'),
    }).strict().refine((value) => value.to >= value.from, { message: 'Timeline end must not precede its start.' }),
  }).strict(),
  z.object({ tool: z.literal('atros_transit'), args: z.object({ asOf: isoDateSchema }).strict() }).strict(),
  z.object({ tool: z.literal('atros_current_dasha'), args: z.object({}).strict() }).strict(),
  z.object({
    tool: z.literal('atros_dasha'),
    args: z.object({ years: z.number().int().min(1).max(120).default(50) }).strict(),
  }).strict(),
]);
export type AtrosPlanCalculation = z.infer<typeof AtrosPlanCalculationSchema>;

export const RunPlanStepSchema = z.discriminatedUnion('kind', [
  RunPlanStepBaseSchema.extend({ kind: z.literal('retrieve') }).strict(),
  RunPlanStepBaseSchema.extend({ kind: z.literal('calculate'), calculation: AtrosPlanCalculationSchema }).strict(),
  RunPlanStepBaseSchema.extend({ kind: z.literal('evaluate') }).strict(),
  RunPlanStepBaseSchema.extend({ kind: z.literal('verify') }).strict(),
]);
export type RunPlanStep = z.infer<typeof RunPlanStepSchema>;

export const RunPlanSchema = z.object({
  goal: z.string().min(1).max(1000),
  mode: z.enum(['rectification', 'timing', 'profile_understanding']),
  steps: z.array(RunPlanStepSchema).max(8).min(1),
  retrievalQueries: z.array(z.string().min(1).max(300)).max(6).default([]),
  relevantFactKeys: z.array(z.string().min(1).max(120)).max(20).default([]),
  dateRange: z.object({ from: isoDateSchema, to: isoDateSchema }).optional(),
});
export type RunPlan = z.infer<typeof RunPlanSchema>;

export const RunCheckpointSchema = z.object({
  currentGoal: z.string().max(1000).default(''),
  planStepIndex: z.number().int().min(0).default(0),
  lastCompletedStep: z.string().max(120).default(''),
  nextAction: z.string().max(500).default(''),
  activeHypothesisIds: z.array(z.string().uuid()).default([]),
  evidenceReviewedIds: z.array(z.string().uuid()).default([]),
  focusedQuestion: FocusedQuestionSchema.nullable().default(null),
  rejectedDraftCount: z.number().int().min(0).default(0),
  contextVersion: z.number().int().min(0).default(0),
});
export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;

export const RunVerificationSchema = z.object({
  verdict: z.enum(['supported', 'needs_more_evidence', 'contradicted']),
  unsupportedClaims: z.array(z.string().max(500)).max(20).default([]),
  requiredEvidenceIds: z.array(z.string().uuid()).max(20).default([]),
  reason: z.string().min(1).max(2000),
});
export type RunVerification = z.infer<typeof RunVerificationSchema>;

// ---------------------------------------------------------------------------
// Model tool argument schemas (strict; the registry injects identity IDs)
// ---------------------------------------------------------------------------

export const astroRecordPlanArgsSchema = z.object({ plan: RunPlanSchema });
export type AstroRecordPlanArgs = z.infer<typeof astroRecordPlanArgsSchema>;

export const astroContextSearchArgsSchema = z.object({
  query: z.string().max(300).default(''),
  kinds: z
    .array(z.enum(['fact', 'evidence', 'hypothesis', 'event', 'session', 'message']))
    .max(6)
    .optional(),
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
  limit: z.number().int().min(1).max(25).optional(),
});
export type AstroContextSearchArgs = z.infer<typeof astroContextSearchArgsSchema>;

export const astroPersonMapGetArgsSchema = z.object({
  factKeys: z.array(z.string().min(1).max(120)).max(25).default([]),
  includeRetired: z.boolean().default(false),
});
export type AstroPersonMapGetArgs = z.infer<typeof astroPersonMapGetArgsSchema>;

export const astroEvidenceRecordArgsSchema = z.object({
  sourceMessageId: z.string().uuid().optional(),
  sourceEventId: z.string().uuid().optional(),
  evidenceType: z.string().min(1).max(80),
  exactQuote: z.string().min(1).max(2000),
  summary: z.string().min(1).max(1000),
  normalized: z.record(z.string(), z.unknown()).default({}),
  occurredOn: isoDateSchema.optional(),
  quality: z.number().min(0).max(1).default(0.5),
  assertionMode: z.enum(['direct', 'derived']).default('direct'),
});
export type AstroEvidenceRecordArgs = z.infer<typeof astroEvidenceRecordArgsSchema>;

export const astroPersonFactProposeArgsSchema = z.object({
  factKey: z.string().min(1).max(120),
  value: z.record(z.string(), z.unknown()),
  summary: z.string().min(1).max(500),
  origin: z.enum(['direct', 'derived']),
  evidenceIds: z.array(z.string().uuid()).max(10),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type AstroPersonFactProposeArgs = z.infer<typeof astroPersonFactProposeArgsSchema>;

export const astroPersonFactAssessArgsSchema = z.object({
  factKey: z.string().min(1).max(120),
  expectedRevision: z.number().int().min(1),
  action: z.enum(['confirm', 'contradict', 'retire']),
  evidenceIds: z.array(z.string().uuid()).max(10).default([]),
  reason: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1).optional(),
});
export type AstroPersonFactAssessArgs = z.infer<typeof astroPersonFactAssessArgsSchema>;

export const astroHypothesesGetArgsSchema = z.object({
  includeEliminated: z.boolean().default(false),
});
export type AstroHypothesesGetArgs = z.infer<typeof astroHypothesesGetArgsSchema>;

export const astroFinishRunArgsSchema = z.object({
  answer: z.string().min(1).max(6000),
  terminalStatus: z.enum(['waiting_for_user', 'complete']),
  focusedQuestion: z
    .object({
      prompt: z.string().min(1).max(2000),
      responseKind: z.enum(['free_text', 'single_choice']),
      options: z.array(FocusedQuestionOptionSchema).max(12).default([]),
      allowFreeText: z.boolean().default(true),
    })
    .nullable()
    .default(null),
  nextAction: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  groundingFactIds: z.array(z.string().uuid()).max(20).default([]),
  groundingEvidenceIds: z.array(z.string().uuid()).max(20).default([]),
  groundingHypothesisIds: z.array(z.string().uuid()).max(20).default([]),
});
export type AstroFinishRunArgs = z.infer<typeof astroFinishRunArgsSchema>;

// ---------------------------------------------------------------------------
// Workflow stream events (SSE transport shape)
// ---------------------------------------------------------------------------

export const RunEventName = [
  'run.started',
  'phase.changed',
  'tool.started',
  'tool.completed',
  'question.ready',
  'answer.ready',
  'run.completed',
  'run.failed',
] as const;
export const runEventNameSchema = z.enum(RunEventName);
export type RunEventName = (typeof RunEventName)[number];

export const AstrologerRunEventSchema = z.object({
  event: runEventNameSchema,
  runId: z.string().uuid(),
  phase: z.enum(['planning', 'retrieval', 'analysis', 'verification', 'responding']).optional(),
  tool: z.string().max(80).optional(),
  summary: z.string().max(300).optional(),
  cacheHit: z.boolean().optional(),
  question: FocusedQuestionSchema.nullable().optional(),
  status: z.enum(['active', 'waiting_for_user', 'complete', 'failed']).optional(),
  error: z.object({ code: agentErrorCodeSchema, message: z.string().max(300), resumable: z.boolean() }).optional(),
});
export type AstrologerRunEvent = z.infer<typeof AstrologerRunEventSchema>;

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

export const StartRunResponseSchema = z.object({
  runId: z.string().uuid(),
  messageId: z.string().uuid().nullable(),
  status: z.enum(['active', 'waiting_for_user', 'complete', 'failed']),
  eventsUrl: z.string(),
  replayed: z.boolean(),
});
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export const IntakeStartResponseSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  runId: z.string().uuid(),
  status: z.enum(['active', 'waiting_for_user', 'complete', 'failed']),
  eventsUrl: z.string(),
  replayed: z.boolean(),
});
export type IntakeStartResponse = z.infer<typeof IntakeStartResponseSchema>;

export const ResumeRunResponseSchema = StartRunResponseSchema;
export type ResumeRunResponse = StartRunResponse;

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

// ---------------------------------------------------------------------------
// Agent-facing run context (from worker_astro_relevant_context)
// ---------------------------------------------------------------------------

export const RelevantContextItemSchema = z.object({
  kind: z.enum(['fact', 'evidence', 'hypothesis', 'event', 'session', 'message']),
  id: z.string().uuid(),
  rank: z.number(),
  title: z.string(),
  excerpt: z.string(),
  confidence: z.number().nullable(),
  status: z.string().nullable(),
  createdAt: z.string(),
});
export type RelevantContextItem = z.infer<typeof RelevantContextItemSchema>;

export const ContextManifestSchema = z.object({
  runId: z.string().uuid(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  profileReady: z.boolean(),
  hasFrozenChart: z.boolean(),
  hasFrozenSensitivity: z.boolean(),
  memoryVersion: z.number().int().min(0),
  sessionCheckpoint: RunCheckpointSchema,
  sessionStatus: z.enum(['active', 'waiting_for_user', 'complete', 'failed']),
  facts: z.array(
    z.object({
      id: z.string().uuid(),
      factKey: z.string(),
      summary: z.string(),
      origin: z.enum(['direct', 'derived']),
      status: z.enum(['proposed', 'confirmed', 'contradicted', 'retired']),
      confidence: z.number(),
      revision: z.number().int().min(1),
    }),
  ),
  hypotheses: z.array(
    z.object({
      id: z.string().uuid(),
      hid: z.string(),
      claim: z.string(),
      status: z.enum(['open', 'confirmed', 'eliminated', 'ambiguous']),
      confidence: z.number(),
      revision: z.number().int().min(1),
    }),
  ),
  priorSessionSummaries: z.array(
    z.object({
      sessionId: z.string().uuid(),
      summaryText: z.string(),
      updatedAt: z.string(),
    }),
  ),
  recentMessages: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type ContextManifest = z.infer<typeof ContextManifestSchema>;

export const FactRowSchema = z.object({
  id: z.string().uuid(),
  fact_key: z.string(),
  value_json: z.record(z.string(), z.unknown()),
  summary: z.string(),
  origin: z.enum(['direct', 'derived']),
  status: z.enum(['proposed', 'confirmed', 'contradicted', 'retired']),
  confidence: z.number(),
  revision: z.number().int().min(1),
});
export type FactRow = z.infer<typeof FactRowSchema>;

export const EvidenceRowSchema = z.object({
  id: z.string().uuid(),
  source_kind: z.enum(['user_statement', 'life_event', 'profile_record', 'agent_derivation']),
  assertion_mode: z.enum(['direct', 'derived']),
  evidence_type: z.string(),
  exact_quote: z.string(),
  summary: z.string(),
  normalized_json: z.record(z.string(), z.unknown()),
  occurred_on: z.string().nullable(),
  quality: z.number(),
  created_at: z.string(),
});
export type EvidenceRow = z.infer<typeof EvidenceRowSchema>;
