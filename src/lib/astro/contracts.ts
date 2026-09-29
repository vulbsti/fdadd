/**
 * Shared typed contracts for the durable astrologer agent system.
 *
 * Every database row crossing into application code, every API DTO, and every Workflow stream event is parsed through
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
// Session checkpoint
// ---------------------------------------------------------------------------

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
  'answer.delta',
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
  /** Streamed draft text. A new segment starts a new assistant message and replaces the draft. */
  delta: z.string().max(16000).optional(),
  segment: z.number().int().nonnegative().optional(),
  /** Last live-event row a delta covers; a retried poll can repeat rows, and the reader skips them. */
  seq: z.number().int().nonnegative().optional(),
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
