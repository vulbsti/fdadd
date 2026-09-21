/**
 * The single persistence boundary for the durable astrologer agent.
 *
 * Wraps the authenticated user-entry RPCs (request-scoped client) and the
 * service-role worker RPCs/queries (admin client). Every returned row is
 * validated against `contracts.ts`; database errors are normalized into
 * `AgentErrorCode` and never swallowed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AstrologerMessageSchema,
  AstrologerRunStepSchema,
  FactRowSchema,
  FocusedQuestionSchema,
  type AstrologerMessage,
  type AstrologerRunStep,
  type AgentErrorCode,
  type ApiErrorDto,
  type BirthInput,
  type ContextManifest,
  type EvidenceRow,
  type FactRow,
  type FocusedQuestion,
  type RunCheckpoint,
  type RunPlan,
  type RunVerification,
} from './contracts';
import { ContextManifestSchema, RunVerificationSchema } from './contracts';
import { projectSelectedSources, type SelectedContextRow, type SelectedSource } from './selected-context';

export class AgentStoreError extends Error {
  readonly code: AgentErrorCode;
  readonly dbError?: string;

  constructor(code: AgentErrorCode, message: string, dbError?: string) {
    super(message);
    this.code = code;
    this.dbError = dbError;
  }

  toDto(runId?: string, resumable?: boolean): ApiErrorDto {
    return { code: this.code, message: this.message, runId, resumable };
  }
}

const PG_ERROR_CODES: Record<string, AgentErrorCode> = {
  P0002: 'not_found', // no_data_found
  P0003: 'conflict', // too_many_rows is 21000; we use custom codes below
  ANF01: 'not_found',
  AFB01: 'forbidden',
  ACF01: 'conflict',
  ASV01: 'stale_version',
  AQU01: 'quota_exceeded',
  AIT01: 'invalid_transition',
  AIR01: 'invalid_request',
};

const PG_CONSTRAINT_HINTS: Record<string, AgentErrorCode> = {
  23505: 'conflict', // unique_violation
  23503: 'invalid_request', // foreign_key_violation
  23514: 'invalid_request', // check_violation
};

function normalizeDbError(error: { code?: string; message?: string }): AgentStoreError {
  const code = error.code ?? '';
  if (code === 'PGRST202') {
    return new AgentStoreError(
      'unconfigured',
      'Astrologer database functions are not deployed. Please apply the Supabase migrations and try again.',
      error.message,
    );
  }
  const mapped = PG_ERROR_CODES[code] ?? PG_CONSTRAINT_HINTS[code.split('')[0] === '2' ? code : ''];
  if (mapped) {
    return new AgentStoreError(mapped, error.message ?? 'database error', error.message);
  }
  return new AgentStoreError('internal', error.message ?? 'database error', error.message);
}
/**
 * Returns query data or throws a normalized AgentStoreError. Named for its
 * contract: every Supabase result passes through it, no error is swallowed.
 */
function unwrapQuery<T>(result: {
  data: T | null;
  error: { code?: string; message?: string } | null;
}): T {
  if (result.error) throw normalizeDbError(result.error);
  return result.data as T;
}

// ---------------------------------------------------------------------------

export interface RunRow {
  id: string;
  user_id: string;
  profile_id: string;
  session_id: string;
  kind: 'intake' | 'question';
  status: 'active' | 'waiting_for_user' | 'complete' | 'failed';
  phase: 'planning' | 'retrieval' | 'analysis' | 'verification' | 'responding' | null;
  client_request_id: string;
  triggering_message_id: string | null;
  resume_from_run_id: string | null;
  output_message_id: string | null;
  workflow_run_id: string | null;
  plan_json: RunPlan | null;
  checkpoint_json: Record<string, unknown>;
  context_version: number;
  last_completed_step: string | null;
  next_action: string | null;
  resumable: boolean;
  step_count: number;
  version: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function parseCheckpoint(raw: unknown): RunCheckpoint {
  return {
    currentGoal: typeof (raw as Record<string, unknown>)?.currentGoal === 'string'
      ? (raw as Record<string, string>).currentGoal : '',
    planStepIndex: typeof (raw as Record<string, unknown>)?.planStepIndex === 'number'
      ? (raw as Record<string, number>).planStepIndex : 0,
    lastCompletedStep: typeof (raw as Record<string, unknown>)?.lastCompletedStep === 'string'
      ? (raw as Record<string, string>).lastCompletedStep : '',
    nextAction: typeof (raw as Record<string, unknown>)?.nextAction === 'string'
      ? (raw as Record<string, string>).nextAction : '',
    activeHypothesisIds: Array.isArray((raw as Record<string, unknown>)?.activeHypothesisIds)
      ? ((raw as Record<string, unknown>).activeHypothesisIds as string[]) : [],
    evidenceReviewedIds: Array.isArray((raw as Record<string, unknown>)?.evidenceReviewedIds)
      ? ((raw as Record<string, unknown>).evidenceReviewedIds as string[]) : [],
    focusedQuestion: ((raw as Record<string, unknown>)?.focusedQuestion ?? null) as FocusedQuestion | null,
    rejectedDraftCount: typeof (raw as Record<string, unknown>)?.rejectedDraftCount === 'number'
      ? (raw as Record<string, number>).rejectedDraftCount : 0,
    contextVersion: typeof (raw as Record<string, unknown>)?.contextVersion === 'number'
      ? (raw as Record<string, number>).contextVersion : 0,
  };
}

export function parsePlan(raw: unknown): RunPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as RunPlan;
}

export function parseVerification(raw: unknown): RunVerification | null {
  const parsed = RunVerificationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toMessage(row: Record<string, unknown>): AstrologerMessage {
  return AstrologerMessageSchema.parse({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    runId: row.run_id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface BeginIntakeResult {
  profileId: string;
  sessionId: string;
  runId: string;
  status: string;
  replayed: boolean;
}

export interface BeginRunResult {
  runId: string;
  messageId: string | null;
  status: string;
  replayed: boolean;
}

export interface CheckpointResult {
  version: number;
  stepCount: number;
  messageId: string | null;
  questionId: string | null;
}

export interface MemoryChangeResult {
  factId: string;
  revision: number;
  status: string;
  memoryVersion: number;
}

export interface ClaimResult {
  claimed: boolean;
  replayed: boolean;
  toolCalls: number;
}

export class AgentStore {
  constructor(
    /** Request-scoped authenticated client (user-entry RPCs, SELECTs). */
    private readonly user: SupabaseClient,
    /** Service-role client (worker RPCs). Optional for user-only contexts. */
    private readonly admin?: SupabaseClient,
  ) {}


  /** Service-role client accessor for calculation wrappers needing raw queries. */
  get adminClient(): SupabaseClient {
    return this.adminRequired();
  }

  private adminRequired(): SupabaseClient {
    if (!this.admin) {
      throw new AgentStoreError('internal', 'service-role client is not available in this context');
    }
    return this.admin;
  }

  // -- User-entry RPCs ------------------------------------------------------

  async beginProfileIntake(birth: BirthInput, clientRequestId: string): Promise<BeginIntakeResult> {
    const { data, error } = await this.user.rpc('begin_astro_profile_intake', {
      p_birth: birth as unknown as Record<string, unknown>,
      p_client_request_id: clientRequestId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as BeginIntakeResult;
  }

  async createSession(profileId: string): Promise<{ sessionId: string; profileId: string }> {
    const { data, error } = await this.user.rpc('create_astro_session', {
      p_profile_id: profileId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { sessionId: string; profileId: string };
  }

  async beginAgentRun(input: {
    sessionId: string;
    message: string;
    clientMessageId: string;
    answerToQuestionId?: string | null;
  }): Promise<BeginRunResult> {
    const { data, error } = await this.user.rpc('begin_astro_agent_run', {
      p_session_id: input.sessionId,
      p_message: input.message,
      p_client_message_id: input.clientMessageId,
      p_answer_to_question_id: input.answerToQuestionId ?? null,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as BeginRunResult;
  }

  async resumeAgentRun(failedRunId: string, clientRequestId: string): Promise<BeginRunResult> {
    const { data, error } = await this.user.rpc('resume_astro_agent_run', {
      p_failed_run_id: failedRunId,
      p_client_request_id: clientRequestId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as BeginRunResult;
  }

  async attachWorkflowRun(runId: string, workflowRunId: string): Promise<{ workflowRunId: string; won: boolean }> {
    const { data, error } = await this.user.rpc('attach_astro_workflow_run', {
      p_run_id: runId,
      p_workflow_run_id: workflowRunId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { workflowRunId: string; won: boolean };
  }

  // -- Run reads ------------------------------------------------------------

  async getRun(runId: string): Promise<RunRow> {
    const row = unwrapQuery(
      await this.user.from('astro_agent_runs').select('*').eq('id', runId).maybeSingle(),
    );
    if (!row) throw new AgentStoreError('not_found', 'run not found');
    return row as unknown as RunRow;
  }

  async getRunByWorkflowId(workflowRunId: string): Promise<RunRow | null> {
    const row = unwrapQuery(
      await this.user
        .from('astro_agent_runs')
        .select('*')
        .eq('workflow_run_id', workflowRunId)
        .maybeSingle(),
    );
    return (row as unknown as RunRow) ?? null;
  }

  /** Return bounded, owner-scoped execution receipts for the trace panel. */
  async listRunSteps(runId: string): Promise<AstrologerRunStep[]> {
    const rows = unwrapQuery(
      await this.user
        .from('astro_agent_run_steps')
        .select(
          'id, ordinal, step_key, kind, status, tool_name, input_summary, output_summary, refs, cache_hit, created_at, completed_at',
        )
        .eq('run_id', runId)
        .order('ordinal', { ascending: true })
        .limit(300),
    ) as Array<Record<string, unknown>>;
    return rows.map((row) => AstrologerRunStepSchema.parse({
      id: row.id as string,
      ordinal: Number(row.ordinal ?? 0),
      stepKey: row.step_key as string,
      kind: row.kind as AstrologerRunStep['kind'],
      status: row.status as AstrologerRunStep['status'],
      toolName: (row.tool_name as string | null) ?? null,
      inputSummary: (row.input_summary as string | null) ?? null,
      outputSummary: (row.output_summary as string | null) ?? null,
      refs: (row.refs as Record<string, unknown> | null) ?? {},
      cacheHit: Boolean(row.cache_hit),
      createdAt: row.created_at as string,
      completedAt: (row.completed_at as string | null) ?? null,
    }));
  }

  async getProfile(profileId: string): Promise<Record<string, unknown> | null> {
    const row = unwrapQuery(
      await this.user.from('astro_profiles').select('*').eq('id', profileId).maybeSingle(),
    );
    return (row ?? null) as Record<string, unknown> | null;
  }

  async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    const row = unwrapQuery(
      await this.user.from('astro_sessions').select('*').eq('id', sessionId).maybeSingle(),
    );
    return (row ?? null) as Record<string, unknown> | null;
  }

  async listSessions(userId: string): Promise<Array<Record<string, unknown>>> {
    return unwrapQuery(
      await this.user
        .from('astro_sessions')
        .select('*, profile:astro_sessions_profile_owner_fk(name)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50),
    ) as unknown as Array<Record<string, unknown>>;
  }

  async listProfiles(userId: string): Promise<Array<Record<string, unknown>>> {
    return unwrapQuery(
      await this.user
        .from('astro_profiles')
        .select('id, name, initialization_status, initialization_error, chart_json, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ) as unknown as Array<Record<string, unknown>>;
  }

  /** Newest-50 user/assistant messages with keyset pagination, returned chronological. */
  async listMessages(
    sessionId: string,
    cursor?: { createdAt: string; id: string } | null,
  ): Promise<{ messages: AstrologerMessage[]; nextCursor: { createdAt: string; id: string } | null }> {
    let query = this.user
      .from('astro_messages')
      .select('id, role, content, created_at, run_id')
      .eq('session_id', sessionId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (cursor) {
      // A timestamp alone skips rows tied at the page boundary. The second
      // sort key is part of the seek predicate as well as the ORDER BY.
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
    const rows = unwrapQuery(await query) as Array<Record<string, unknown>>;
    const messages = rows.map(toMessage);
    let nextCursor: { createdAt: string; id: string } | null = null;
    if (rows.length === 50) {
      const last = rows[rows.length - 1];
      nextCursor = { createdAt: last.created_at as string, id: last.id as string };
    }
    return { messages: messages.reverse(), nextCursor };
  }

  // -- Worker RPCs (service role) -------------------------------------------

  async workerCheckpoint(input: {
    runId: string;
    expectedVersion: number;
    step: {
      stepKey: string;
      kind: 'plan' | 'retrieval' | 'model' | 'tool' | 'verification' | 'checkpoint';
      status: 'started' | 'succeeded' | 'failed';
      toolName?: string;
      inputSummary?: string;
      outputSummary?: string;
      refs?: Record<string, unknown>;
      cacheHit?: boolean;
      nextAction?: string;
      phase?: string;
      contextVersion?: number;
    };
    checkpoint?: RunCheckpoint | null;
    sessionPatch?: Record<string, unknown> | null;
    assistantMessage?: {
      content: string;
      status: 'waiting_for_user' | 'complete';
      // The worker RPC creates the canonical question ID at publication.
      focusedQuestion: Omit<FocusedQuestion, 'id'> | null;
    } | null;
  }): Promise<CheckpointResult> {
    const { data, error } = await this.adminRequired().rpc('worker_checkpoint_astro_run', {
      p_run_id: input.runId,
      p_expected_version: input.expectedVersion,
      p_step: input.step as unknown as Record<string, unknown>,
      p_checkpoint: (input.checkpoint ?? null) as unknown as Record<string, unknown> | null,
      p_session_patch: (input.sessionPatch ?? null) as unknown as Record<string, unknown> | null,
      p_assistant_message: (input.assistantMessage ?? null) as unknown as Record<string, unknown> | null,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as CheckpointResult;
  }

  async workerFailRun(input: {
    runId: string;
    expectedVersion: number;
    errorCode: string;
    errorMessage: string;
    resumable?: boolean;
    nextAction?: string | null;
  }): Promise<{ status: string }> {
    const { data, error } = await this.adminRequired().rpc('worker_fail_astro_run', {
      p_run_id: input.runId,
      p_expected_version: input.expectedVersion,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
      p_resumable: input.resumable ?? true,
      p_next_action: input.nextAction ?? null,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { status: string };
  }

  async workerRecordEvidence(
    runId: string,
    evidence: {
      sourceMessageId?: string;
      sourceEventId?: string;
      sourceKind?: string;
      assertionMode?: 'direct' | 'derived';
      evidenceType: string;
      exactQuote: string;
      summary: string;
      normalized?: Record<string, unknown>;
      occurredOn?: string;
      quality?: number;
      idempotencyKey?: string;
    },
  ): Promise<{ evidenceId: string; replayed: boolean; verified: boolean }> {
    const { data, error } = await this.adminRequired().rpc('worker_record_astro_evidence', {
      p_run_id: runId,
      p_evidence: evidence as unknown as Record<string, unknown>,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { evidenceId: string; replayed: boolean; verified: boolean };
  }

  async workerApplyMemoryChange(
    runId: string,
    operation: {
      action: 'propose' | 'confirm' | 'contradict' | 'retire';
      factKey: string;
      value?: Record<string, unknown>;
      summary?: string;
      origin?: 'direct' | 'derived';
      confidence?: number;
      expectedRevision?: number;
      evidenceIds?: string[];
      reason?: string;
    },
  ): Promise<MemoryChangeResult> {
    const { data, error } = await this.adminRequired().rpc('worker_apply_astro_memory_change', {
      p_run_id: runId,
      p_operation: operation as unknown as Record<string, unknown>,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as MemoryChangeResult;
  }

  async workerClaimToolCall(input: {
    runId: string;
    stepKey: string;
    toolName: string;
    day: string;
    limit?: number;
  }): Promise<ClaimResult> {
    const { data, error } = await this.adminRequired().rpc('worker_claim_astro_tool_call', {
      p_run_id: input.runId,
      p_step_key: input.stepKey,
      p_tool_name: input.toolName,
      p_day: input.day,
      p_limit: input.limit ?? 100,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as ClaimResult;
  }

  async workerFinishIntake(input: {
    runId: string;
    chart: unknown;
    sensitivity: unknown;
    greeting: string;
  }): Promise<{ status: string; replayed: boolean; messageId: string | null }> {
    const { data, error } = await this.adminRequired().rpc('worker_finish_astro_intake', {
      p_run_id: input.runId,
      p_chart: input.chart as unknown as Record<string, unknown>,
      p_sensitivity: input.sensitivity as unknown as Record<string, unknown>,
      p_greeting: input.greeting,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { status: string; replayed: boolean; messageId: string | null };
  }

  async workerFailIntake(input: {
    runId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<{ status: string }> {
    const { data, error } = await this.adminRequired().rpc('worker_fail_astro_intake', {
      p_run_id: input.runId,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { status: string };
  }

  async workerRelevantContext(input: {
    runId: string;
    query: string;
    kinds?: string[] | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
  }): Promise<Array<{
    kind: string;
    id: string;
    rank: number;
    title: string;
    excerpt: string;
    confidence: number | null;
    status: string | null;
    created_at: string;
  }>> {
    const { data, error } = await this.adminRequired().rpc('worker_astro_relevant_context', {
      p_run_id: input.runId,
      p_query: input.query,
      p_kinds: input.kinds ?? null,
      p_from: input.fromDate ?? null,
      p_to: input.toDate ?? null,
      p_limit: input.limit ?? 20,
    });
    if (error) throw normalizeDbError(error);
    return (data ?? []) as unknown as Array<{
      kind: string;
      id: string;
      rank: number;
      title: string;
      excerpt: string;
      confidence: number | null;
      status: string | null;
      created_at: string;
    }>;
  }

  // -- Calculation cache ----------------------------------------------------

  async readCalculationCache(input: {
    profileId: string;
    engineVersion: string;
    toolName: string;
    argsHash: string;
  }): Promise<{ id: string; resultJson: unknown } | null> {
    const row = unwrapQuery(
      await this.adminRequired()
        .from('astro_calculation_cache')
        .select('id, result_json, expires_at')
        .eq('profile_id', input.profileId)
        .eq('engine_version', input.engineVersion)
        .eq('tool_name', input.toolName)
        .eq('args_hash', input.argsHash)
        .maybeSingle(),
    ) as unknown as { id: string; result_json: unknown; expires_at: string | null } | null;
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return { id: row.id, resultJson: row.result_json };
  }

  async writeCalculationCache(input: {
    userId: string;
    profileId: string;
    engineVersion: string;
    toolName: string;
    argsHash: string;
    argsJson: Record<string, unknown>;
    resultJson: unknown;
    expiresAt?: string | null;
  }): Promise<string> {
    const row = unwrapQuery(
      await this.adminRequired()
        .from('astro_calculation_cache')
        .upsert(
          {
            user_id: input.userId,
            profile_id: input.profileId,
            engine_version: input.engineVersion,
            tool_name: input.toolName,
            args_hash: input.argsHash,
            args_json: input.argsJson,
            result_json: input.resultJson,
            expires_at: input.expiresAt ?? null,
          },
          { onConflict: 'profile_id,engine_version,tool_name,args_hash' },
        )
        .select('id')
        .single(),
    ) as unknown as { id: string };
    return row.id;
  }

  // -- Run context items ----------------------------------------------------

  async recordContextItems(
    runId: string,
    userId: string,
    profileId: string,
    items: Array<{
      kind: 'fact' | 'evidence' | 'hypothesis' | 'event' | 'message';
      id: string;
      purpose: 'selected' | 'reviewed' | 'produced';
      rank?: number | null;
      reason?: string | null;
      stepKey?: string | null;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((item) => ({
      user_id: userId,
      profile_id: profileId,
      run_id: runId,
      [`${item.kind}_id`]: item.id,
      purpose: item.purpose,
      rank: item.rank ?? null,
      reason: item.reason ?? null,
      step_key: item.stepKey ?? null,
    }));
    const { error } = await this.adminRequired()
      .from('astro_run_context_items')
      .upsert(rows, { onConflict: 'run_id,purpose,item_key', ignoreDuplicates: true });
    if (error) throw normalizeDbError(error);
  }

  async listContextItems(runId: string): Promise<Array<Record<string, unknown>>> {
    return unwrapQuery(
      await this.adminRequired()
        .from('astro_run_context_items')
        .select('*')
        .eq('run_id', runId),
    ) as unknown as Array<Record<string, unknown>>;
  }

  /** Resolve selection IDs back to their owned source records for model use. */
  async listSelectedSources(runId: string): Promise<SelectedSource[]> {
    const run = await this.getRun(runId);
    const rows = unwrapQuery(
      await this.adminRequired()
        .from('astro_run_context_items')
        .select(`item_key,created_at,
          fact:astro_person_facts!astro_run_context_items_fact_fk(id,profile_id,fact_key,summary,status,origin,revision),
          evidence:astro_evidence!astro_run_context_items_evidence_fk(id,profile_id,source_kind,assertion_mode,summary,exact_quote,occurred_on),
          hypothesis:astro_hypotheses!astro_run_context_items_hypothesis_fk(id,profile_id,hid,claim,status,revision),
          event:astro_events!astro_run_context_items_event_fk(id,profile_id,on_date,title,detail,fit),
          message:astro_messages!astro_run_context_items_message_fk(id,role,content,session:astro_sessions!astro_messages_session_owner_fk(profile_id))`)
        .eq('run_id', runId)
        .eq('user_id', run.user_id)
        .eq('profile_id', run.profile_id)
        .eq('purpose', 'selected')
        .order('created_at', { ascending: false })
        .limit(100),
    ) as unknown as SelectedContextRow[];
    return projectSelectedSources(rows, run.profile_id);
  }

  // -- Facts / evidence / hypotheses ----------------------------------------

  async listFacts(profileId: string, includeRetired = false): Promise<FactRow[]> {
    let query = this.adminRequired()
      .from('astro_person_facts')
      .select('id, fact_key, value_json, summary, origin, status, confidence, revision')
      .eq('profile_id', profileId);
    if (!includeRetired) query = query.neq('status', 'retired');
    const rows = unwrapQuery(await query) as Array<Record<string, unknown>>;
    return rows.map((row) => FactRowSchema.parse(row));
  }

  async getFact(profileId: string, factKey: string): Promise<FactRow | null> {
    const row = unwrapQuery(
      await this.adminRequired()
        .from('astro_person_facts')
        .select('id, fact_key, value_json, summary, origin, status, confidence, revision')
        .eq('profile_id', profileId)
        .eq('fact_key', factKey)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    return row ? FactRowSchema.parse(row) : null;
  }

  async getEvidence(evidenceId: string): Promise<EvidenceRow | null> {
    const row = unwrapQuery(
      await this.adminRequired()
        .from('astro_evidence')
        .select(
          'id, source_kind, assertion_mode, evidence_type, exact_quote, summary, normalized_json, occurred_on, quality, created_at',
        )
        .eq('id', evidenceId)
        .maybeSingle(),
    ) as unknown as Record<string, unknown> | null;
    return row
      ? {
          id: row.id as string,
          source_kind: row.source_kind as EvidenceRow['source_kind'],
          assertion_mode: row.assertion_mode as EvidenceRow['assertion_mode'],
          evidence_type: row.evidence_type as string,
          exact_quote: row.exact_quote as string,
          summary: row.summary as string,
          normalized_json: (row.normalized_json ?? {}) as Record<string, unknown>,
          occurred_on: (row.occurred_on as string) ?? null,
          quality: Number(row.quality ?? 0.5),
          created_at: row.created_at as string,
        }
      : null;
  }

  async listHypotheses(profileId: string, includeEliminated = false): Promise<
    Array<{
      id: string;
      hid: string;
      claim: string;
      status: string;
      confidence: number;
      revision: number;
    }>
  > {
    let query = this.adminRequired()
      .from('astro_hypotheses')
      .select('id, hid, claim, status, confidence, revision')
      .eq('profile_id', profileId);
    if (!includeEliminated) query = query.neq('status', 'eliminated');
    return unwrapQuery(await query) as unknown as Array<{
      id: string;
      hid: string;
      claim: string;
      status: string;
      confidence: number;
      revision: number;
    }>;
  }

  // -- Prior session summaries ----------------------------------------------

  async listPriorSessionSummaries(
    profileId: string,
    excludeSessionId: string,
  ): Promise<Array<{ sessionId: string; summaryText: string; updatedAt: string }>> {
    const rows = unwrapQuery(
      await this.adminRequired()
        .from('astro_sessions')
        .select('id, summary_text, updated_at')
        .eq('profile_id', profileId)
        .neq('id', excludeSessionId)
        .neq('summary_text', '')
        .order('updated_at', { ascending: false })
        .limit(10),
    ) as unknown as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      sessionId: row.id as string,
      summaryText: row.summary_text as string,
      updatedAt: row.updated_at as string,
    }));
  }

  // -- Context manifest -------------------------------------------------------

  async loadContextManifest(runId: string): Promise<ContextManifest> {
    const run = await this.getRun(runId);
    const profile = await this.getProfile(run.profile_id);
    if (!profile) throw new AgentStoreError('not_found', 'profile not found');
    const session = await this.getSession(run.session_id);
    if (!session) throw new AgentStoreError('not_found', 'session not found');

    const [facts, hypotheses, priorSummaries, messages] = await Promise.all([
      this.listFacts(run.profile_id),
      this.listHypotheses(run.profile_id),
      this.listPriorSessionSummaries(run.profile_id, run.session_id),
      this.listMessages(run.session_id, null),
    ]);

    return ContextManifestSchema.parse({
      runId: run.id,
      profileId: run.profile_id,
      profileName: profile.name as string,
      profileReady: profile.initialization_status === 'ready',
      hasFrozenChart: profile.chart_json != null,
      hasFrozenSensitivity: profile.sensitivity_json != null,
      memoryVersion: Number(profile.memory_version ?? 0),
      sessionCheckpoint: {
        ...parseCheckpoint(session.checkpoint_json),
        // The terminal RPC generates the durable question ID after writing
        // checkpoint_json. Read the canonical session field on later turns.
        focusedQuestion: FocusedQuestionSchema.safeParse(session.current_question).data ?? null,
      },
      sessionStatus: session.status as ContextManifest['sessionStatus'],
      facts: facts.map((f) => ({
        id: f.id,
        factKey: f.fact_key,
        summary: f.summary,
        origin: f.origin,
        status: f.status,
        confidence: f.confidence,
        revision: f.revision,
      })),
      hypotheses: hypotheses.map((h) => ({
        id: h.id,
        hid: h.hid,
        claim: h.claim,
        status: h.status as 'open' | 'confirmed' | 'eliminated' | 'ambiguous',
        confidence: Number(h.confidence ?? 0.5),
        revision: Number(h.revision ?? 1),
      })),
      priorSessionSummaries: priorSummaries,
      recentMessages: messages.messages
        .slice(-6)
        .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  }
}
