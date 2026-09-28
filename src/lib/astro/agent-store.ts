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
  type AstrologerMessage,
  type AstrologerRunStep,
  type AgentErrorCode,
  type ApiErrorDto,
  type BirthInput,
  type FocusedQuestion,
  type RunCheckpoint,
} from './contracts';

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

export interface BeginBirthSetupResult extends BeginIntakeResult {
  birthRevision: number;
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

export interface DispatchClaim {
  runId: string;
  leaseToken: string;
  attempt: number;
  maxAttempts: number;
}

export interface DispatchCompletion {
  won: boolean;
  workflowRunId: string | null;
  fenced?: boolean;
}

export interface DispatchRelease {
  released: boolean;
  fenced: boolean;
  dead: boolean;
}

export class AgentStore {
  constructor(
    /** Request-scoped authenticated client (user-entry RPCs, SELECTs). */
    private readonly user: SupabaseClient,
    /** Service-role client (worker RPCs). Optional for user-only contexts. */
    private readonly admin?: SupabaseClient,
  ) {}


  /** Service-role client accessor for callers needing raw queries. */
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

  async beginExistingProfileBirthSetup(
    profileId: string,
    birth: Omit<BirthInput, 'name'>,
    clientRequestId: string,
  ): Promise<BeginBirthSetupResult> {
    const { data, error } = await this.user.rpc('begin_person_birth_setup', {
      p_profile_id: profileId,
      p_birth: birth as unknown as Record<string, unknown>,
      p_client_request_id: clientRequestId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as BeginBirthSetupResult;
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
    const { data, error } = await this.adminRequired().rpc('attach_astro_workflow_run', {
      p_run_id: runId,
      p_workflow_run_id: workflowRunId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as { workflowRunId: string; won: boolean };
  }

  // -- Service-only durable dispatch ---------------------------------------

  async claimRunDispatch(runId: string | null = null, leaseSeconds = 60): Promise<DispatchClaim | null> {
    const { data, error } = await this.adminRequired().rpc('worker_claim_astro_run_dispatch', {
      p_run_id: runId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw normalizeDbError(error);
    return (data as unknown as DispatchClaim | null) ?? null;
  }

  async completeRunDispatch(
    runId: string,
    leaseToken: string,
    workflowRunId: string,
  ): Promise<DispatchCompletion> {
    const { data, error } = await this.adminRequired().rpc('worker_complete_astro_run_dispatch', {
      p_run_id: runId,
      p_lease_token: leaseToken,
      p_workflow_run_id: workflowRunId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as DispatchCompletion;
  }

  async releaseRunDispatch(
    runId: string,
    leaseToken: string,
    errorMessage: string,
    retrySeconds: number,
  ): Promise<DispatchRelease> {
    const { data, error } = await this.adminRequired().rpc('worker_release_astro_run_dispatch', {
      p_run_id: runId,
      p_lease_token: leaseToken,
      p_error_message: errorMessage,
      p_retry_seconds: retrySeconds,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as DispatchRelease;
  }

  async claimRunExecution(runId: string, workflowRunId: string): Promise<DispatchCompletion> {
    const { data, error } = await this.adminRequired().rpc('worker_claim_astro_run_execution', {
      p_run_id: runId,
      p_workflow_run_id: workflowRunId,
    });
    if (error) throw normalizeDbError(error);
    return data as unknown as DispatchCompletion;
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
}
