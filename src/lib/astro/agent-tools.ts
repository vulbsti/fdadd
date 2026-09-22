/**
 * Model tool registry for the durable astrologer agent.
 *
 * One registry binds strict tool schemas to handlers. The registry injects
 * run/user/profile/session identity — the model never supplies IDs. Existing
 * deterministic Atros wrappers in `tools.ts` are preserved behind the cache;
 * there is no second calculation implementation.
 *
 * Stateful tools require expected fact/hypothesis revision. Evidence
 * recording verifies exact quotes and is idempotent per (run, step_key).
 */

import { createHash } from 'node:crypto';
import type { AgentStore, RunRow } from './agent-store';
import {
  astroContextSearchArgsSchema,
  astroEvidenceRecordArgsSchema,
  astroFinishRunArgsSchema,
  astroHypothesesGetArgsSchema,
  astroPersonFactAssessArgsSchema,
  astroPersonFactProposeArgsSchema,
  astroPersonMapGetArgsSchema,
  astroRecordPlanArgsSchema,
  validateFocusedQuestion,
  type AstroFinishRunArgs,
  type AstroPersonFactAssessArgs,
  type AstroPersonFactProposeArgs,
  type FocusedQuestion,
  type RunPlan,
} from './contracts';
import {
  ATROS_ENGINE_VERSION,
  type AtrosErrorCode,
  type AtrosResult,
} from './atros-commands';
import {
  atrosChart,
  atrosSensitivity,
  atrosTimeline,
  atrosTransit,
  atrosCurrentDasha,
  atrosDasha,
  type ProfileRow,
} from './tools';

// ---------------------------------------------------------------------------
// Calculation cache
// ---------------------------------------------------------------------------

export type CachedCalculation =
  | { ok: true; result: unknown; cacheHit: boolean; cacheId: string | null }
  | { ok: false; error: { code: AtrosErrorCode; message: string }; cacheHit: false; cacheId: null };

const ATROS_ERROR_CODES = new Set<AtrosErrorCode>([
  'INVALID_BIRTHDATA',
  'EPHEMERIS_ERROR',
  'INTERNAL',
]);

function normalizeAtrosResult(value: unknown): {
  result: AtrosResult;
  diagnostic: string | null;
} {
  if (!value || typeof value !== 'object') {
    return {
      result: { ok: false, error: { code: 'INTERNAL', message: 'invalid executor result' } },
      diagnostic: 'Atros executor returned a non-object result',
    };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true && Object.hasOwn(candidate, 'data')) {
    return { result: { ok: true, data: candidate.data }, diagnostic: null };
  }

  const error = candidate.error as Record<string, unknown> | null | undefined;
  if (
    candidate.ok === false &&
    error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    ATROS_ERROR_CODES.has(error.code as AtrosErrorCode) &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return {
      result: {
        ok: false,
        error: {
          code: error.code as AtrosErrorCode,
          message: error.message.slice(0, 1000),
        },
      },
      diagnostic: null,
    };
  }

  return {
    result: { ok: false, error: { code: 'INTERNAL', message: 'invalid executor result' } },
    diagnostic: 'Atros executor returned a malformed result',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Atros command failed';
}

/**
 * Canonicalize args, hash them, and read-through the deterministic cache.
 * Only successful results are stored. Expiry policy lives at the caller:
 * current-dasha entries expire at the next UTC day; everything else is
 * engine-version-scoped without expiry.
 */
export async function cachedAtrosCall(
  store: AgentStore,
  run: RunRow,
  birth: { date: string; time: string; latitude: number; longitude: number; timezone: string; name?: string; place_name?: string },
  toolName: string,
  args: Record<string, unknown>,
  execute: () => Promise<unknown>,
): Promise<CachedCalculation> {
  const canonical = JSON.stringify({ birth, toolName, args });
  const argsHash = createHash('sha256').update(canonical).digest('hex');

  const hit = await store.readCalculationCache({
    profileId: run.profile_id,
    engineVersion: ATROS_ENGINE_VERSION,
    toolName,
    argsHash,
  });
  if (hit) return { ok: true, result: hit.resultJson, cacheHit: true, cacheId: hit.id };

  let rawOutcome: unknown;
  try {
    rawOutcome = await execute();
  } catch (error) {
    const diagnostic = errorMessage(error);
    console.error('[astrologer-tool] Atros executor threw', {
      run_id: run.id,
      profile_id: run.profile_id,
      tool_name: toolName,
      message: diagnostic.slice(0, 1000),
    });
    rawOutcome = { ok: false, error: { code: 'INTERNAL', message: diagnostic } };
  }

  const normalized = normalizeAtrosResult(rawOutcome);
  const outcome = normalized.result;
  if (!outcome.ok) {
    if (normalized.diagnostic) {
      console.error('[astrologer-tool] Invalid Atros executor result', {
        run_id: run.id,
        profile_id: run.profile_id,
        tool_name: toolName,
        message: normalized.diagnostic,
      });
    } else {
      console.error('[astrologer-tool] Atros calculation failed', {
        run_id: run.id,
        profile_id: run.profile_id,
        tool_name: toolName,
        code: outcome.error.code,
        message: outcome.error.message.slice(0, 1000),
      });
    }
    return { ok: false, error: outcome.error, cacheHit: false, cacheId: null };
  }

  const expiresAt =
    toolName === 'atros_current_dasha' ? nextUtcMidnight() : null;
  const cacheId = await store.writeCalculationCache({
    userId: run.user_id,
    profileId: run.profile_id,
    engineVersion: ATROS_ENGINE_VERSION,
    toolName,
    argsHash,
    argsJson: { birth, toolName, args },
    resultJson: outcome.data,
    expiresAt,
  });
  return { ok: true, result: outcome.data, cacheHit: false, cacheId };
}

function nextUtcMidnight(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.toISOString();
}

// ---------------------------------------------------------------------------
// Tool definitions (model-facing schemas)
// ---------------------------------------------------------------------------

export interface ToolContext {
  store: AgentStore;
  run: RunRow;
  profile: ProfileRow;
  /** Server-derived preference and readiness gate; never supplied by the model. */
  astrologyEnabled?: boolean;
  stepKey: string;
  today: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolOutcome {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Convert a ToolOutcome to the plain step-return shape. */
export function toStepOutcome(outcome: ToolOutcome): {
  ok: boolean;
  result: unknown;
  error?: { code: string; message: string };
} {
  return { ok: outcome.ok, result: outcome.result ?? null, error: outcome.error };
}

function err(code: string, message: string): ToolOutcome {
  return { ok: false, error: { code, message } };
}

function ok(result: unknown): ToolOutcome {
  return { ok: true, result };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'astro_record_plan',
    description:
      'Record the execution plan for this run before any other work. Required first call.',
    parameters: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          properties: {
            goal: { type: 'string', maxLength: 1000 },
            mode: { type: 'string', enum: ['rectification', 'timing', 'profile_understanding'] },
            steps: {
              type: 'array',
              maxItems: 8,
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', maxLength: 80 },
                  kind: { type: 'string', enum: ['retrieve', 'calculate', 'evaluate', 'verify'] },
                  objective: { type: 'string', maxLength: 500 },
                },
                required: ['key', 'kind', 'objective'],
              },
            },
            retrievalQueries: { type: 'array', items: { type: 'string' }, maxItems: 6 },
            relevantFactKeys: { type: 'array', items: { type: 'string' }, maxItems: 20 },
            dateRange: {
              type: 'object',
              properties: { from: { type: 'string' }, to: { type: 'string' } },
            },
          },
          required: ['goal', 'mode', 'steps'],
        },
      },
      required: ['plan'],
    },
  },
  {
    name: 'astro_context_search',
    description:
      'Selectively search this person’s memory: facts, evidence, hypotheses, life events, prior session summaries, and past message excerpts. Blank query returns bounded current facts plus recent evidence.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 300 },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: ['fact', 'evidence', 'hypothesis', 'event', 'session', 'message'] },
          maxItems: 6,
        },
        fromDate: { type: 'string', description: 'YYYY-MM-DD' },
        toDate: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  {
    name: 'astro_person_map_get',
    description: 'Read current person-map facts by key, or all non-retired facts when no keys are given.',
    parameters: {
      type: 'object',
      properties: {
        factKeys: { type: 'array', items: { type: 'string' }, maxItems: 25 },
        includeRetired: { type: 'boolean' },
      },
    },
  },
  {
    name: 'astro_evidence_record',
    description:
      'Record immutable evidence. You MUST pass sourceMessageId or sourceEventId; use astro_context_search first when the source ID is unknown. For direct user statements, exactQuote MUST be a verbatim substring of the cited user message.',
    parameters: {
      type: 'object',
      properties: {
        sourceMessageId: { type: 'string', description: 'UUID of the cited user message' },
        sourceEventId: { type: 'string', description: 'UUID of a recorded life event' },
        evidenceType: { type: 'string', maxLength: 80 },
        exactQuote: { type: 'string', maxLength: 2000 },
        summary: { type: 'string', maxLength: 1000 },
        normalized: { type: 'object' },
        occurredOn: { type: 'string', description: 'YYYY-MM-DD' },
        quality: { type: 'number', minimum: 0, maximum: 1 },
        assertionMode: { type: 'string', enum: ['direct', 'derived'] },
      },
      required: ['evidenceType', 'exactQuote', 'summary'],
      anyOf: [
        { required: ['sourceMessageId'] },
        { required: ['sourceEventId'] },
      ],
    },
  },
  {
    name: 'astro_person_fact_propose',
    description:
      'Propose a new person-map fact. Direct facts with a verified verbatim quote may enter confirmed; derived facts always start proposed.',
    parameters: {
      type: 'object',
      properties: {
        factKey: { type: 'string', maxLength: 120 },
        value: { type: 'object' },
        summary: { type: 'string', maxLength: 500 },
        origin: { type: 'string', enum: ['direct', 'derived'] },
        evidenceIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['factKey', 'value', 'summary', 'origin', 'evidenceIds'],
    },
  },
  {
    name: 'astro_person_fact_assess',
    description:
      'Assess an existing fact: confirm, contradict, or retire. Requires the fact’s current revision for optimistic concurrency.',
    parameters: {
      type: 'object',
      properties: {
        factKey: { type: 'string', maxLength: 120 },
        expectedRevision: { type: 'integer', minimum: 1 },
        action: { type: 'string', enum: ['confirm', 'contradict', 'retire'] },
        evidenceIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        reason: { type: 'string', maxLength: 1000 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['factKey', 'expectedRevision', 'action', 'reason'],
    },
  },
  {
    name: 'astro_hypotheses_get',
    description: 'List open/confirmed/ambiguous rectification hypotheses for this person.',
    parameters: {
      type: 'object',
      properties: { includeEliminated: { type: 'boolean' } },
    },
  },
  {
    name: 'astro_finish_run',
    description:
      'Propose the final response. The run finishes waiting_for_user (with an optional focused question) or complete. Every claim must cite grounding IDs.',
    parameters: {
      type: 'object',
      properties: {
        answer: { type: 'string', maxLength: 6000 },
        terminalStatus: { type: 'string', enum: ['waiting_for_user', 'complete'] },
        focusedQuestion: {
          type: 'object',
          nullable: true,
          properties: {
            prompt: { type: 'string', maxLength: 2000 },
            responseKind: { type: 'string', enum: ['free_text', 'single_choice'] },
            options: {
              type: 'array',
              maxItems: 12,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  kind: { type: 'string', enum: ['answer', 'control'] },
                },
                required: ['id', 'label', 'kind'],
              },
            },
            allowFreeText: { type: 'boolean' },
          },
          required: ['prompt', 'responseKind'],
        },
        nextAction: { type: 'string', maxLength: 500 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        groundingFactIds: { type: 'array', items: { type: 'string' } },
        groundingEvidenceIds: { type: 'array', items: { type: 'string' } },
        groundingHypothesisIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'terminalStatus'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function requireIdempotentKey(ctx: ToolContext, suffix: string): string {
  return `run:${ctx.run.id}:step:${ctx.stepKey}:${suffix}`;
}

async function handleContextSearch(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroContextSearchArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  const rows = await ctx.store.workerRelevantContext({
    runId: ctx.run.id,
    query: parsed.data.query,
    kinds: parsed.data.kinds ?? null,
    fromDate: parsed.data.fromDate ?? null,
    toDate: parsed.data.toDate ?? null,
    limit: parsed.data.limit ?? 20,
  });
  await ctx.store.recordContextItems(
    ctx.run.id,
    ctx.run.user_id,
    ctx.run.profile_id,
    rows
      // Session rows have no context-item FK; they surface via the manifest.
      .filter((row) => row.kind !== 'session')
      .map((row, index) => ({
        kind: row.kind as 'fact' | 'evidence' | 'hypothesis' | 'event' | 'message',
        id: row.id,
        purpose: 'selected' as const,
        rank: index + 1,
        reason: `astro_context_search:${ctx.stepKey}`,
        stepKey: ctx.stepKey,
      })),
  );
  return ok(rows);
}

async function handlePersonMapGet(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroPersonMapGetArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  if (parsed.data.factKeys.length === 0) {
    return ok(await ctx.store.listFacts(ctx.run.profile_id, parsed.data.includeRetired));
  }
  const facts = await Promise.all(
    parsed.data.factKeys.map((key) => ctx.store.getFact(ctx.run.profile_id, key)),
  );
  return ok(facts.filter(Boolean));
}

async function handleEvidenceRecord(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroEvidenceRecordArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  const args = parsed.data;
  if (args.sourceMessageId == null && args.sourceEventId == null) {
    return err('invalid_request', 'cite a sourceMessageId or sourceEventId');
  }
  try {
    const stored = await ctx.store.workerRecordEvidence(ctx.run.id, {
      sourceMessageId: args.sourceMessageId,
      sourceEventId: args.sourceEventId,
      sourceKind: args.sourceMessageId ? 'user_statement' : 'life_event',
      assertionMode: args.assertionMode,
      evidenceType: args.evidenceType,
      exactQuote: args.exactQuote,
      summary: args.summary,
      normalized: args.normalized,
      occurredOn: args.occurredOn,
      quality: args.quality,
      idempotencyKey: requireIdempotentKey(ctx, `evidence:${args.evidenceType}`),
    });
    return ok(stored);
  } catch (e) {
    return err('invalid_request', e instanceof Error ? e.message : 'evidence recording failed');
  }
}

async function handleFactPropose(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroPersonFactProposeArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  const args = parsed.data;
  if (args.evidenceIds.length === 0) {
    return err('invalid_request', 'a fact proposal must cite at least one evidence ID');
  }
  try {
    const result = await ctx.store.workerApplyMemoryChange(ctx.run.id, {
      action: 'propose',
      factKey: args.factKey,
      value: args.value,
      summary: args.summary,
      origin: args.origin,
      confidence: args.confidence,
      evidenceIds: args.evidenceIds,
      reason: `proposed via ${ctx.stepKey}`,
    });
    return ok(result);
  } catch (e) {
    return err('conflict', e instanceof Error ? e.message : 'fact proposal failed');
  }
}

async function handleFactAssess(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroPersonFactAssessArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  const args = parsed.data as AstroPersonFactAssessArgs;
  try {
    const result = await ctx.store.workerApplyMemoryChange(ctx.run.id, {
      action: args.action,
      factKey: args.factKey,
      expectedRevision: args.expectedRevision,
      confidence: args.confidence,
      evidenceIds: args.evidenceIds,
      reason: args.reason,
    });
    return ok(result);
  } catch (e) {
    return err('invalid_transition', e instanceof Error ? e.message : 'fact assessment failed');
  }
}

async function handleHypothesesGet(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroHypothesesGetArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  return ok(await ctx.store.listHypotheses(ctx.run.profile_id, parsed.data.includeEliminated));
}

export interface FinishRunPayload extends AstroFinishRunArgs {
  questionId: string | null;
}

async function handleFinishRun(ctx: ToolContext, rawArgs: unknown): Promise<ToolOutcome> {
  const parsed = astroFinishRunArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return err('invalid_request', parsed.error.message);
  const args = parsed.data;
  if (args.focusedQuestion) {
    const candidate: FocusedQuestion = {
      id: 'pending',
      prompt: args.focusedQuestion.prompt,
      responseKind: args.focusedQuestion.responseKind,
      options: args.focusedQuestion.options,
      allowFreeText: args.focusedQuestion.allowFreeText,
    };
    const problem = validateFocusedQuestion(candidate);
    if (problem) return err('invalid_request', problem);
  }
  return ok({ ...args, questionId: null });
}

/** Validate and persist a plan proposed through `astro_record_plan`. */
export function validatePlanArgs(rawArgs: unknown): { ok: true; plan: RunPlan } | { ok: false; message: string } {
  const parsed = astroRecordPlanArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  return { ok: true, plan: parsed.data.plan };
}

export async function dispatchTool(
  ctx: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<ToolOutcome> {
  switch (name) {
    case 'astro_context_search':
      return handleContextSearch(ctx, rawArgs);
    case 'astro_person_map_get':
      return handlePersonMapGet(ctx, rawArgs);
    case 'astro_evidence_record':
      return handleEvidenceRecord(ctx, rawArgs);
    case 'astro_person_fact_propose':
      return handleFactPropose(ctx, rawArgs);
    case 'astro_person_fact_assess':
      return handleFactAssess(ctx, rawArgs);
    case 'astro_hypotheses_get':
      return handleHypothesesGet(ctx, rawArgs);
    case 'astro_finish_run':
      return handleFinishRun(ctx, rawArgs);
    default:
      return err('invalid_request', `unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic Atros tool handlers (cache-backed)
// ---------------------------------------------------------------------------

export async function runAtrosTool(
  ctx: ToolContext,
  toolName: string,
  options?: { from?: string; to?: string; level?: string; asOf?: string; years?: number; offsets?: number[] },
  executeOverride?: () => Promise<unknown>,
): Promise<ToolOutcome> {
  if (
    ctx.astrologyEnabled === false ||
    !ctx.profile.birth_date ||
    !ctx.profile.birth_time ||
    ctx.profile.lat === null ||
    ctx.profile.lng === null ||
    !ctx.profile.tz
  ) {
    return err(
      'astrology_unavailable',
      'Astrological calculations are unavailable in personal-only mode or until complete birth information is configured.',
    );
  }
  const birth = {
    name: ctx.profile.name,
    date: ctx.profile.birth_date,
    time: ctx.profile.birth_time,
    latitude: ctx.profile.lat,
    longitude: ctx.profile.lng,
    timezone: ctx.profile.tz,
    place_name: ctx.profile.place_name ?? undefined,
  };

  const exec = {
    'atros_chart': () => atrosChart(ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id),
    'atros_sensitivity': () =>
      atrosSensitivity(ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id, options?.offsets),
    'atros_timeline': () =>
      atrosTimeline(
        ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id,
        options?.from ?? '', options?.to ?? '',
        (options?.level as 'maha' | 'antar' | 'pratyantar' | 'sookshma') ?? 'pratyantar',
      ),
    'atros_transit': () =>
      atrosTransit(ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id, options?.asOf ?? ''),
    'atros_current_dasha': () =>
      atrosCurrentDasha(ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id),
    'atros_dasha': () =>
      atrosDasha(ctx.store.adminClient, ctx.run.user_id, ctx.run.session_id, ctx.run.profile_id, options?.years ?? 50),
  }[toolName];

  if (!exec) return err('invalid_request', `unknown calculation tool: ${toolName}`);

  const args: Record<string, unknown> = {
    from: options?.from, to: options?.to, level: options?.level,
    asOf: options?.asOf, years: options?.years, offsets: options?.offsets,
  };

  const outcome = await cachedAtrosCall(
    ctx.store,
    ctx.run,
    birth,
    toolName,
    args,
    executeOverride ?? exec,
  );
  if (!outcome.ok) {
    const message = {
      INVALID_BIRTHDATA: 'The calculation could not run because the stored birth data is invalid.',
      EPHEMERIS_ERROR: 'The calculation could not run because ephemeris data was unavailable.',
      INTERNAL: 'The calculation service could not complete this request.',
    }[outcome.error.code] ?? 'The calculation could not be completed.';
    return err(`atros_${outcome.error.code.toLowerCase()}`, message);
  }
  return ok({ ...outcome, toolName });
}
