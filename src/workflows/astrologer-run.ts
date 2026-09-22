/**
 * Durable astrologer run workflow: explicit plan → retrieve → analyze →
 * verify per user message.
 *
 * A run never waits months for another message: it finishes as
 * `waiting_for_user`, `complete`, or `failed`; the next user message starts
 * a new Workflow linked by `resume_from_run_id`. Workflow inputs contain
 * only the internal `astro_agent_runs.id`. Every model/tool/database
 * boundary is a durable `'use step'`; checkpoints persist before and after
 * every external boundary so Workflow replay plus the stable step key
 * returns prior committed state instead of duplicating effects.
 */

import { FatalError, getWorkflowMetadata, getWritable } from 'workflow';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore, parseCheckpoint, parsePlan, parseVerification, type RunRow } from '@/lib/astro/agent-store';
import { loadContextManifest, selectRelevantContext, recordSelectedContext } from '@/lib/astro/agent-context';
import { dispatchTool, runAtrosTool, TOOL_DEFINITIONS, validatePlanArgs, toStepOutcome, type ToolContext } from '@/lib/astro/agent-tools';
import { chatCompletion, ProviderError, type ChatMessage, type ToolCallRequest, type FunctionToolDefinition } from '@/lib/ai/provider';
import type { AstroFinishRunArgs, AgentErrorCode, AstrologerRunEvent, RunCheckpoint, RunPlan, RunVerification } from '@/lib/astro/contracts';
import { getErrorMessage } from '@/lib/astro/workflow-errors';
import { selectedContextBlock, type SelectedSource } from '@/lib/astro/selected-context';
import { parseFinishProposal } from '@/lib/astro/finish-proposal';
import { verificationNeedsRetry } from '@/lib/astro/verification-policy';
import {
  parsePersonRunMode,
  filterAtrosTools,
  atrosToolsAllowed,
  personRunModeFailure,
  withAtrosConsent,
  withStablePersonRunMode,
  type PersonRunMode,
} from '@/lib/astro/run-mode';

// This budget includes retrieval/model/tool/verification operations. Sixteen
// leaves room for one bounded verifier-driven revision without permitting an
// open-ended agent loop.
const MAX_AGENT_STEPS = 16;
const MAX_REJECTED_DRAFTS = 2;
const DAILY_TOOL_CALL_LIMIT = 100;

// ---------------------------------------------------------------------------
// Durable steps
// ---------------------------------------------------------------------------

interface RunSnapshot {
  run: RunRow;
  checkpoint: RunCheckpoint;
  plan: RunPlan | null;
  profile: {
    id: string;
    name: string;
    birthDate: string | null;
    birthTime: string | null;
    lat: number | null;
    lng: number | null;
    tz: string | null;
    placeName: string | null;
    hasChart: boolean;
    hasSensitivity: boolean;
    astrologyEnabled: boolean;
    modeEpoch: number;
    privacyEpoch: number;
  };
  manifestSummary: string;
}

async function loadRunSnapshot(runId: string): Promise<RunSnapshot> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const manifest = await loadContextManifest(store, runId);
  const run = await store.getRun(runId);
  const profile = await store.getProfile(run.profile_id);
  if (!profile) throw new FatalError('profile missing for run');
  const preferencesResult = await store.adminClient
    .from('person_preferences')
    .select('astrology_enabled, mode_epoch')
    .eq('profile_id', run.profile_id)
    .eq('user_id', run.user_id)
    .maybeSingle();
  const mode = parsePersonRunMode(preferencesResult);
  const headResult = await store.adminClient
    .from('person_model_heads')
    .select('privacy_epoch')
    .eq('profile_id', run.profile_id)
    .eq('user_id', run.user_id)
    .maybeSingle();
  const hasBirthData = Boolean(
    profile.birth_date && profile.birth_time && profile.lat !== null &&
    profile.lat !== undefined && profile.lng !== null && profile.lng !== undefined && profile.tz,
  );

  const checkpoint = manifest.sessionCheckpoint;
  const summaryLines = [
    `Person: ${manifest.profileName} (memory v${manifest.memoryVersion}, ready=${manifest.profileReady})`,
    `Reasoning mode=${mode.astrologyEnabled && hasBirthData ? 'astrology_enabled' : 'personal_only'}.`,
    mode.astrologyEnabled && hasBirthData
      ? `Frozen chart=${manifest.hasFrozenChart} sensitivity=${manifest.hasFrozenSensitivity}. Birth input is configured.`
      : 'Astrological calculations and interpretations are not available for this run.',
    `Session status: ${manifest.sessionStatus}`,
    checkpoint.currentGoal ? `Continuing goal: ${checkpoint.currentGoal}` : 'New question.',
    checkpoint.nextAction ? `Prior next action: ${checkpoint.nextAction}` : '',
    `Facts (${manifest.facts.length}): ${manifest.facts
      .slice(0, 12)
      .map((f) => `${f.factKey}=${f.status}`)
      .join(', ')}`,
    `Open hypotheses (${manifest.hypotheses.length}).`,
    `Prior sessions summarized: ${manifest.priorSessionSummaries.length}.`,
  ].filter(Boolean);

  return {
    run,
    checkpoint,
    plan: parsePlan(run.plan_json),
    profile: {
      id: manifest.profileId,
      name: manifest.profileName,
      birthDate: (profile.birth_date as string | null) ?? null,
      birthTime: (profile.birth_time as string | null) ?? null,
      lat: (profile.lat as number | null) ?? null,
      lng: (profile.lng as number | null) ?? null,
      tz: (profile.tz as string | null) ?? null,
      placeName: (profile.place_name as string | null) ?? null,
      hasChart: manifest.hasFrozenChart,
      hasSensitivity: manifest.hasFrozenSensitivity,
      astrologyEnabled: mode.astrologyEnabled && hasBirthData,
      modeEpoch: mode.modeEpoch,
      privacyEpoch: Number(headResult.data?.privacy_epoch ?? 0),
    },
    manifestSummary: summaryLines.join('\n'),
  };
}

async function readCurrentPersonRunMode(profileId: string, userId: string): Promise<PersonRunMode> {
  const result = await createAdminClient()
    .from('person_preferences')
    .select('astrology_enabled,mode_epoch')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();
  return parsePersonRunMode(result);
}

/** Persist a checkpoint + step row; optionally record the plan or a terminal message. */
async function checkpointStep(input: {
  runId: string;
  expectedVersion: number;
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
  checkpoint?: RunCheckpoint | null;
  plan?: RunPlan | null;
  assistantMessage?: {
    content: string;
    status: 'waiting_for_user' | 'complete';
    focusedQuestion: AstroFinishRunArgs['focusedQuestion'];
  } | null;
  sessionPatch?: Record<string, unknown> | null;
}): Promise<{ version: number; stepCount: number }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const outcome = await store.workerCheckpoint({
    runId: input.runId,
    expectedVersion: input.expectedVersion,
    step: {
      stepKey: input.stepKey,
      kind: input.kind,
      status: input.status,
      toolName: input.toolName,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      refs: input.refs,
      cacheHit: input.cacheHit,
      nextAction: input.nextAction,
      phase: input.phase,
    },
    checkpoint: input.checkpoint ?? null,
    sessionPatch: input.sessionPatch ?? null,
    assistantMessage: input.assistantMessage ?? null,
  });
  if (input.plan) {
    await store.adminClient
      .from('astro_agent_runs')
      .update({ plan_json: input.plan })
      .eq('id', input.runId);
  }
  return { version: outcome.version, stepCount: outcome.stepCount };
}

/** One planning-model call. OpenCode Go uses automatic tool selection. */
async function planRun(input: {
  runId: string;
  profileId: string;
  userId: string;
  expectedModeEpoch: number;
  question: string;
  manifestSummary: string;
  priorSummaries: string;
  hasBirthData: boolean;
}): Promise<{ plan: RunPlan; provider?: string; model?: string }> {
  'use step';
  return planWithProvider(input);
}

function providerTools(names?: string[]): FunctionToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => !names || names.includes(t.name)).map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

const VERIFICATION_TOOL: FunctionToolDefinition = {
  type: 'function',
  function: {
    name: 'astro_record_verification',
    description: 'Record whether a proposed answer is supported by the supplied context and tool receipts.',
    parameters: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['supported', 'needs_more_evidence', 'contradicted'],
        },
        unsupportedClaims: {
          type: 'array',
          items: { type: 'string', maxLength: 500 },
          maxItems: 20,
        },
        requiredEvidenceIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 20,
        },
        reason: { type: 'string', maxLength: 2000 },
      },
      required: ['verdict', 'unsupportedClaims', 'requiredEvidenceIds', 'reason'],
    },
  },
};

async function planWithProvider(input: {
  runId: string;
  profileId: string;
  userId: string;
  expectedModeEpoch: number;
  question: string;
  manifestSummary: string;
  priorSummaries: string;
  hasBirthData: boolean;
}): Promise<{ plan: RunPlan; provider?: string; model?: string }> {
  const result = await withStablePersonRunMode(
    input.expectedModeEpoch,
    () => readCurrentPersonRunMode(input.profileId, input.userId),
    (mode) => chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            atrosToolsAllowed(mode, input.hasBirthData)
              ? 'You are Aidoraa\'s companion with an enabled optional Vedic astrology layer. Record an execution plan with astro_record_plan before answering. Steps are retrieve/calculate/evaluate/verify. Never invent person facts; rely on tools.'
              : 'You are Aidoraa\'s personal companion. Astrology is disabled for this run: do not use astrological claims, context, guidance, or calculations. Record an execution plan with astro_record_plan before answering. Never invent person facts; rely on permitted personal sources.',
        },
        {
          role: 'user',
          content: `Run context:\n${input.manifestSummary}\n\nPrior session summaries:\n${input.priorSummaries}\n\nUser question: ${input.question}`,
        },
      ],
      tools: providerTools(['astro_record_plan']),
      // Pi/OMP let the OpenCode Go Responses adapter use automatic selection.
      // The single planner tool plus this instruction supplies the constraint.
      toolChoice: 'auto',
      sessionId: input.runId,
      maxTokens: 2048,
    }),
  );
  const call = result.choices[0]?.message.tool_calls?.[0];
  if (!call) throw new Error('planning model returned no astro_record_plan call');
  const parsed = validatePlanArgs(JSON.parse(call.function.arguments || '{}'));
  if (!parsed.ok) throw new Error(`invalid plan: ${parsed.message}`);
  return { plan: parsed.plan, provider: result.provider, model: result.model };
}

/** Selective retrieval step: query the worker RPC and persist selections. */
async function retrieveContext(input: {
  runId: string;
  query: string;
  stepKey: string;
  fromDate?: string | null;
  toDate?: string | null;
  kinds?: string[] | null;
  limit?: number;
}): Promise<Array<{ kind: string; id: string; title: string; excerpt: string }>> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(input.runId);
  const selection = await selectRelevantContext(store, input.runId, input.query, {
    kinds: input.kinds ?? undefined,
    fromDate: input.fromDate ?? null,
    toDate: input.toDate ?? null,
    limit: input.limit ?? 20,
    reason: `retrieve:${input.stepKey}`,
  });
  await recordSelectedContext(store, input.runId, run.user_id, run.profile_id, selection, input.stepKey);
  return selection.items.map((item) => ({
    kind: item.kind,
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
  }));
}

/** Claim one tool call against the daily quota (idempotent per step key). */
async function claimToolCall(input: {
  runId: string;
  stepKey: string;
  toolName: string;
}): Promise<{ claimed: boolean; replayed: boolean }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const day = new Date().toISOString().slice(0, 10);
  const claim = await store.workerClaimToolCall({
    runId: input.runId,
    stepKey: input.stepKey,
    toolName: input.toolName,
    day,
    limit: DAILY_TOOL_CALL_LIMIT,
  });
  return { claimed: claim.claimed, replayed: claim.replayed };
}

/** Execute one model decision step and return its ordered tool calls or draft. */
async function modelDecisionStep(input: {
  runId: string;
  profileId: string;
  userId: string;
  expectedModeEpoch: number;
  stepKey: string;
  messages: ChatMessage[];
  forceFinish: boolean;
  hasBirthData: boolean;
}): Promise<{ content: string | null; toolCalls: ToolCallRequest[]; provider?: string; model?: string }> {
  'use step';
  const messages = input.forceFinish
    ? [
        ...input.messages,
        {
          role: 'system' as const,
          content:
            'The run is near its step limit. Do not request more evidence. Call astro_finish_run now with the best supported answer or one focused question, and state uncertainty explicitly.',
        },
      ]
    : input.messages;
  const result = await withStablePersonRunMode(
    input.expectedModeEpoch,
    () => readCurrentPersonRunMode(input.profileId, input.userId),
    (mode) => chatCompletion({
      messages,
      // Budget enforcement must be structural, not just prompt text. Once the
      // run reaches its final two operations, do not expose retrieval or Atros
      // tools that could consume the remaining budget without a draft.
      tools: input.forceFinish
        ? providerTools(['astro_finish_run'])
        : filterAtrosTools(
            providerTools().filter((tool) => tool.function.name !== 'astro_record_plan'),
            mode,
            input.hasBirthData,
          ),
      // OpenCode Go/Responses only accepts automatic selection. The prompt and
      // the tool registry provide the semantic constraint when finishing.
      toolChoice: 'auto',
      sessionId: input.runId,
      maxTokens: 4096,
    }),
  );
  const message = result.choices[0]?.message;
  return {
    content: message?.content ?? null,
    toolCalls: message?.tool_calls ?? [],
    provider: result.provider,
    model: result.model,
  };
}

/** Execute one registered tool call. */
async function executeToolStep(input: {
  runId: string;
  expectedModeEpoch: number;
  stepKey: string;
  toolName: string;
  rawArgs: string;
}): Promise<{ ok: boolean; result: unknown; error?: { code: string; message: string } }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(input.runId);
  const profile = await store.getProfile(run.profile_id);
  if (!profile) throw new FatalError('profile missing for tool step');
  const mode = await withStablePersonRunMode(
    input.expectedModeEpoch,
    () => readCurrentPersonRunMode(run.profile_id, run.user_id),
    async (currentMode) => currentMode,
  );
  const ctx: ToolContext = {
    store,
    run,
    profile: {
      id: run.profile_id,
      user_id: run.user_id,
      name: profile.name as string,
      birth_date: (profile.birth_date as string | null) ?? null,
      birth_time: (profile.birth_time as string | null) ?? null,
      lat: (profile.lat as number | null) ?? null,
      lng: (profile.lng as number | null) ?? null,
      tz: (profile.tz as string | null) ?? null,
      place_name: (profile.place_name as string | null) ?? null,
      time_source: (profile.time_source as string | null) ?? 'unknown',
      time_confidence: (profile.time_confidence as string | null) ?? 'unknown',
      chart_json: profile.chart_json ?? null,
      sensitivity_json: profile.sensitivity_json ?? null,
    },
    astrologyEnabled: mode.astrologyEnabled,
    stepKey: input.stepKey,
    today: new Date().toISOString().slice(0, 10),
  };
  if (input.toolName.startsWith('atros_')) {
    const atros = await withAtrosConsent(mode, Boolean(
      ctx.profile.birth_date && ctx.profile.birth_time && ctx.profile.lat !== null &&
      ctx.profile.lng !== null && ctx.profile.tz,
    ), () => runAtrosTool(ctx, input.toolName, (JSON.parse(input.rawArgs || '{}') ?? {}) as Record<string, never>));
    if (!atros.executed) {
      return {
        ok: false,
        result: null,
        error: { code: 'forbidden', message: 'Astrology is disabled or birth inputs are incomplete.' },
      };
    }
    return toStepOutcome(atros.value);
  }
  const outcome = await dispatchTool(ctx, input.toolName, JSON.parse(input.rawArgs || '{}'));
  return toStepOutcome(outcome);
}

/** Independent verification pass over the draft. */
async function verifyDraft(input: {
  runId: string;
  profileId: string;
  userId: string;
  expectedModeEpoch: number;
  draft: string;
  planGoal: string;
  runContext: string;
  selectedContext: string;
  toolRefs: string;
}): Promise<{ verification: RunVerification; provider?: string; model?: string }> {
  'use step';
  const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a strict verification model. Judge ONLY concrete factual claims in the draft against the supplied selected context and tool references, then call astro_record_verification exactly once. Questions, acknowledgements, intentions, uncertainty statements, and polite framing are not factual claims and need no evidence. A statement that context is absent is supported when the supplied context is empty. A statement that information was recorded is supported by a successful evidence/fact tool receipt. Do not reject a focused question merely because the answer is intentionally waiting for the user to provide missing information.',
      },
      {
        role: 'user',
        content: `Run/profile context:\n${input.runContext}\n\nPlan goal: ${input.planGoal}\n\nSelected context:\n${input.selectedContext}\n\nTool references:\n${input.toolRefs}\n\nDraft:\n${input.draft}`,
      },
    ];
  let provider: string | undefined;
  let model: string | undefined;
  let verification: RunVerification | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await withStablePersonRunMode(
      input.expectedModeEpoch,
      () => readCurrentPersonRunMode(input.profileId, input.userId),
      () => chatCompletion({
        messages: attempt === 0 ? messages : [
          ...messages,
          {
            role: 'system',
            content:
              'Your prior verdict was unparseable or non-actionable. Return supported, or name at least one exact unsupported claim or required evidence ID. Do not return needs_more_evidence with both arrays empty.',
          },
        ],
        tools: [VERIFICATION_TOOL],
        toolChoice: 'auto',
        sessionId: input.runId,
        // Muse Spark may spend the smaller budget on reasoning and return HTTP
        // 200 with an empty output array. Match the decision-step allowance so
        // the structured verification call is actually emitted.
        maxTokens: 4096,
        temperature: 0,
      }),
    );
    provider = result.provider;
    model = result.model;
    const message = result.choices[0]?.message;
    const verificationCall = message?.tool_calls?.find(
      (call) => call.function.name === 'astro_record_verification',
    );
    const content = verificationCall?.function.arguments ?? message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    } catch {
      parsed = null;
    }
    verification = parseVerification(parsed);
    if (!verificationNeedsRetry(verification)) break;
  }
  return {
    verification: verification ?? {
      verdict: 'needs_more_evidence',
      unsupportedClaims: ['The verifier did not return a valid actionable verdict.'],
      requiredEvidenceIds: [],
      reason: 'Verifier contract failed after one bounded retry.',
    },
    provider,
    model,
  };
}

/** Terminal persistence: assistant message + checkpoint + session state. */
async function finalizeRun(input: {
  runId: string;
  expectedVersion: number;
  stepKey: string;
  checkpoint: RunCheckpoint;
  answer: string;
  terminalStatus: 'waiting_for_user' | 'complete';
  focusedQuestion: AstroFinishRunArgs['focusedQuestion'];
  nextAction?: string;
  sessionPatch: Record<string, unknown>;
  expectedModeEpoch: number;
  expectedPrivacyEpoch: number;
}): Promise<{ version: number; messageId: string | null; questionId: string | null }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(input.runId);
  const [preference, head] = await Promise.all([
    store.adminClient.from('person_preferences').select('mode_epoch').eq('profile_id', run.profile_id).eq('user_id', run.user_id).maybeSingle(),
    store.adminClient.from('person_model_heads').select('privacy_epoch').eq('profile_id', run.profile_id).eq('user_id', run.user_id).maybeSingle(),
  ]);
  if (
    Number(preference.data?.mode_epoch ?? 0) !== input.expectedModeEpoch ||
    Number(head.data?.privacy_epoch ?? 0) !== input.expectedPrivacyEpoch
  ) {
    throw new Error('Person mode or privacy eligibility changed before answer publication; resume under the current settings.');
  }
  const outcome = await store.workerCheckpoint({
    runId: input.runId,
    expectedVersion: input.expectedVersion,
    step: {
      stepKey: input.stepKey,
      kind: 'checkpoint',
      status: 'succeeded',
      outputSummary: `finalized ${input.terminalStatus}`,
      phase: 'responding',
      nextAction: input.nextAction,
    },
    checkpoint: input.checkpoint,
    sessionPatch: input.sessionPatch,
    assistantMessage: {
      content: input.answer,
      status: input.terminalStatus,
      focusedQuestion: input.focusedQuestion,
    },
  });
  return { version: outcome.version, messageId: outcome.messageId, questionId: outcome.questionId };
}

/** Durable failure: failed run with resumable flag and next action. */
async function failRun(input: {
  runId: string;
  expectedVersion: number;
  errorCode: string;
  errorMessage: string;
  resumable: boolean;
  nextAction?: string | null;
}): Promise<void> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  await store.workerFailRun(input);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function stepKeyFor(planStepIndex: number, attempt: number, toolIndex: number, toolName: string): string {
  return `${planStepIndex}:${attempt}:${toolIndex}:${toolName}`;
}

function decisionStepKey(
  planStepIndex: number,
  attempt: number,
  modelPass: number,
  toolIndex: number,
  toolName: string,
): string {
  return `${planStepIndex}:${attempt}:pass-${modelPass}:${toolIndex}:${toolName}`;
}

function resultCacheHit(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      'cacheHit' in result &&
      Boolean((result as { cacheHit?: unknown }).cacheHit),
  );
}

type RunEventChunk = { type: AstrologerRunEvent['event']; payload: AstrologerRunEvent };
type RunEventSink = (event: AstrologerRunEvent) => Promise<void>;

/** Workflow functions may obtain a stream, but only steps may write to it. */
async function emitRunEvent(event: AstrologerRunEvent): Promise<void> {
  'use step';
  const writer = getWritable<RunEventChunk>().getWriter();
  try {
    await writer.write({ type: event.event, payload: event });
  } finally {
    writer.releaseLock();
  }
}

function safeFailure(error: unknown): {
  code: AgentErrorCode;
  message: string;
  resumable: boolean;
} {
  const modeFailure = personRunModeFailure(error);
  if (modeFailure) {
    return {
      code: modeFailure.code,
      message: modeFailure.message,
      resumable: true,
    };
  }
  const raw = getErrorMessage(error, 'The astrologer run failed.');
  const providerFailure =
    error instanceof ProviderError ||
    /(?:provider|opencode|openrouter|api key|request failed with status)/i.test(raw);
  return {
    code: 'internal',
    message: providerFailure
      ? 'The astrologer model could not complete this run. You can resume it after the provider request is corrected.'
      : raw.slice(0, 300),
    resumable: true,
  };
}

function safeAgentErrorCode(value: string | null | undefined): AgentErrorCode {
  return value === 'not_found' ||
    value === 'forbidden' ||
    value === 'conflict' ||
    value === 'stale_version' ||
    value === 'quota_exceeded' ||
    value === 'invalid_transition' ||
    value === 'invalid_request' ||
    value === 'unconfigured' ||
    value === 'internal'
    ? value
    : 'internal';
}

async function loadCurrentRun(runId: string): Promise<RunRow | null> {
  'use step';
  try {
    return await new AgentStore(createAdminClient(), createAdminClient()).getRun(runId);
  } catch {
    return null;
  }
}

/**
 * The first durable step fences duplicate Workflow starts. It uses the actual
 * Workflow run ID supplied by the runtime, so even a dispatcher that crashes
 * after `start()` but before attaching can register itself on replay.
 */
async function claimRunExecution(runId: string) {
  'use step';
  const { workflowRunId } = getWorkflowMetadata();
  const store = new AgentStore(createAdminClient(), createAdminClient());
  return store.claimRunExecution(runId, workflowRunId);
}

/**
 * Durable wrapper around the orchestration body. The provider/model/tool
 * boundaries remain steps, while this stream mirrors Pi/OMP lifecycle events
 * without exposing hidden reasoning.
 */
export async function astrologerRunWorkflow(runId: string) {
  'use workflow';

  const emit: RunEventSink = emitRunEvent;

  try {
    const execution = await claimRunExecution(runId);
    if (!execution.won) {
      return {
        status: 'duplicate' as const,
        workflowRunId: execution.workflowRunId,
      };
    }
    await emit({ event: 'run.started', runId, phase: 'planning', status: 'active', summary: 'run started' });
    const result = await astrologerRunWorkflowBody(runId, emit);
    if (result.status === 'failed') {
      const current = await loadCurrentRun(runId);
      await emit({
        event: 'run.failed',
        runId,
        status: 'failed',
        error: {
          code: safeAgentErrorCode(current?.error_code ?? result.errorCode),
          message: current?.error_message?.slice(0, 300) ?? 'The astrologer run failed.',
          resumable: current?.resumable ?? true,
        },
      });
    } else {
      await emit({
        event: 'run.completed',
        runId,
        status: result.status as 'waiting_for_user' | 'complete',
      });
    }
    return result;
  } catch (error) {
    const failure = safeFailure(error);
    console.error('[astrologer-run] failed', { runId, message: getErrorMessage(error) });

    const current = await loadCurrentRun(runId);
    if (current?.status === 'active' || current?.status === 'waiting_for_user') {
      try {
        await failRun({
          runId,
          expectedVersion: current.version,
          errorCode: failure.code,
          errorMessage: failure.message,
          resumable: failure.resumable,
          nextAction: 'Correct the provider or tool issue, then resume this run.',
        });
      } catch (persistError) {
        console.error('[astrologer-run] could not persist failure', {
          runId,
          message: getErrorMessage(persistError),
        });
      }
    }

    const failed = await loadCurrentRun(runId);
    await emit({
      event: 'run.failed',
      runId,
      status: 'failed',
      error: {
        code: failed?.error_code ? safeAgentErrorCode(failed.error_code) : failure.code,
        message: failed?.error_message?.slice(0, 300) ?? failure.message,
        resumable: failed?.resumable ?? failure.resumable,
      },
    });
    return { status: 'failed' as const, errorCode: failure.code };
  }
}

/**
 * One Workflow run per user message. Never fabricates a completion: after
 * two rejected drafts or sixteen agent operations the run fails durably with
 * `resumable=true` and a preserved next action.
 */
async function astrologerRunWorkflowBody(runId: string, emit: RunEventSink) {
  const snapshot = await loadRunSnapshot(runId);
  let version = snapshot.run.version;
  let checkpoint = snapshot.checkpoint;
  const runRow = snapshot.run;

  if (runRow.status !== 'active') {
    return { status: runRow.status as 'waiting_for_user' | 'complete' | 'failed' };
  }

  await emit({ event: 'phase.changed', runId, phase: 'planning', status: 'active', summary: 'planning the request' });

  const triggeringMessage = runRow.triggering_message_id
    ? await loadTriggeringMessage(runId)
    : null;
  const question = triggeringMessage?.content ?? checkpoint.currentGoal ?? 'Continue the reading.';

  // --- Planning ------------------------------------------------------------
  const planKey = stepKeyFor(0, 0, 0, 'astro_record_plan');
  if (!snapshot.plan) {
    const priorSummaries = await loadPriorSummaries(runId);
    const planned = await planRun({
      runId,
      profileId: snapshot.run.profile_id,
      userId: snapshot.run.user_id,
      expectedModeEpoch: snapshot.profile.modeEpoch,
      question,
      manifestSummary: snapshot.manifestSummary,
      priorSummaries,
      hasBirthData: Boolean(snapshot.profile.birthDate && snapshot.profile.birthTime && snapshot.profile.lat !== null && snapshot.profile.lng !== null && snapshot.profile.tz),
    });
    const plan = planned.plan;
    const cp = await checkpointStep({
      runId,
      expectedVersion: version,
      stepKey: planKey,
      kind: 'plan',
      status: 'succeeded',
      outputSummary: `model=${planned.model ?? 'configured'}; plan: ${plan.goal}`,
      phase: 'retrieval',
      checkpoint: { ...checkpoint, currentGoal: plan.goal, planStepIndex: 0, contextVersion: checkpoint.contextVersion + 1 },
      plan,
    });
    version = cp.version;
    checkpoint = { ...checkpoint, currentGoal: plan.goal, planStepIndex: 0, contextVersion: checkpoint.contextVersion + 1 };
  }
  const plan = snapshot.plan ?? (await loadPlan(runId));
  if (!plan) throw new FatalError('run has no plan');

  // --- Plan execution ------------------------------------------------------
  let agentSteps = 0;
  const toolRefs: string[] = [];
  // Unlike the old loop, keep the exact assistant tool-call and tool-result
  // messages in the next request. This is the key Pi/OMP interaction: the
  // provider session header is routing/cache affinity, not conversation state.
  const modelTranscript: ChatMessage[] = [];
  let draft: string | null = null;

  // Verification can reject a draft while the run still has budget. Keep the
  // same durable run alive, append the evidence gap, and restart the plan from
  // its first step so the next model pass can actually use that evidence.
  while (true) {
    draft = null;
    // Workflow replay restores the model-decision step result and reconstructs
    // this typed proposal. The truncated trace is never used as storage.
    let finishProposal: AstroFinishRunArgs | null = null;
    const attempt = checkpoint.rejectedDraftCount;
    for (let planStepIndex = checkpoint.planStepIndex; planStepIndex < plan.steps.length; planStepIndex++) {
      const planStep = plan.steps[planStepIndex];
      if (agentSteps >= MAX_AGENT_STEPS) break;
      const phase: 'retrieval' | 'analysis' = planStep.kind === 'retrieve' ? 'retrieval' : 'analysis';
      await emit({
        event: 'phase.changed',
        runId,
        phase,
        status: 'active',
        summary: `${phase}: ${planStep.objective}`.slice(0, 300),
      });

      if (planStep.kind === 'retrieve') {
      const query = plan.retrievalQueries[planStepIndex % Math.max(plan.retrievalQueries.length, 1)] ?? checkpoint.currentGoal;
      const key = stepKeyFor(planStepIndex, attempt, 0, 'context_search');
      await emit({ event: 'tool.started', runId, phase: 'retrieval', tool: 'astro_context_search', summary: query.slice(0, 300) });
      const items = await retrieveContext({
        runId,
        query,
        stepKey: key,
        fromDate: plan.dateRange?.from ?? null,
        toDate: plan.dateRange?.to ?? null,
      });
      agentSteps++;
      const cp = await checkpointStep({
        runId,
        expectedVersion: version,
        stepKey: key,
        kind: 'retrieval',
        status: 'succeeded',
        outputSummary: `${items.length} items`,
        phase: 'retrieval',
        refs: { itemIds: items.map((i) => i.id).slice(0, 25) },
        checkpoint: { ...checkpoint, lastCompletedStep: key, evidenceReviewedIds: [...new Set([...checkpoint.evidenceReviewedIds, ...items.filter((i) => i.kind === 'evidence').map((i) => i.id)])].slice(0, 50) },
      });
      version = cp.version;
      checkpoint.lastCompletedStep = key;
      await emit({
        event: 'tool.completed',
        runId,
        phase: 'retrieval',
        tool: 'astro_context_search',
        summary: `${items.length} context items selected`,
      });
      continue;
    }

      if (planStep.kind === 'calculate') {
      const toolName = planStep.objective.includes('dasha')
        ? 'atros_current_dasha'
        : planStep.objective.includes('transit')
          ? 'atros_transit'
          : planStep.objective.includes('timeline')
            ? 'atros_timeline'
            : 'atros_chart';
      const key = stepKeyFor(planStepIndex, attempt, 0, toolName);
      await emit({ event: 'tool.started', runId, phase: 'analysis', tool: toolName, summary: 'deterministic chart calculation' });
      await claimToolCall({ runId, stepKey: key, toolName });
      const outcome = await executeToolStep({
        runId,
        expectedModeEpoch: snapshot.profile.modeEpoch,
        stepKey: key,
        toolName,
        rawArgs: JSON.stringify({
          from: plan.dateRange?.from,
          to: plan.dateRange?.to,
          asOf: new Date().toISOString().slice(0, 10),
        }),
      });
      agentSteps++;
      const cacheHit = resultCacheHit(outcome.result);
      const cp = await checkpointStep({
        runId,
        expectedVersion: version,
        stepKey: key,
        kind: 'tool',
        status: outcome.ok ? 'succeeded' : 'failed',
        toolName,
        outputSummary: outcome.ok
          ? `calculation completed${cacheHit ? ' (cache hit)' : ''}`
          : (outcome.error?.message ?? 'failed'),
        refs: { tool: toolName, result: outcome.ok ? 'cached-or-computed' : outcome.error },
        phase: 'analysis',
        cacheHit,
        checkpoint: { ...checkpoint, lastCompletedStep: key },
      });
      version = cp.version;
      checkpoint.lastCompletedStep = key;
      if (outcome.ok) toolRefs.push(`${toolName}: ${JSON.stringify(outcome.result).slice(0, 300)}`);
      await emit({
        event: 'tool.completed',
        runId,
        phase: 'analysis',
        tool: toolName,
        summary: outcome.ok
          ? `calculation completed${cacheHit ? ' (cache hit)' : ''}`
          : (outcome.error?.message ?? 'calculation failed'),
      });
      continue;
    }

      // Evaluate/verify steps may need several model -> tool -> model passes.
      // Keep the pass inside this plan step so each tool result is present in
      // the next provider request instead of accidentally advancing the plan.
      let modelPass = 0;
      while (agentSteps < MAX_AGENT_STEPS && !draft) {
        const key = decisionStepKey(planStepIndex, attempt, modelPass, 0, 'model');
        const manifest = await loadManifestForMessages(runId);
        const messages: ChatMessage[] = [
          {
            role: 'system',
            content:
              snapshot.profile.astrologyEnabled
                ? 'You are Aidoraa\'s companion with an enabled Vedic astrology layer. Use the recorded plan and tools; cite grounding IDs in astro_finish_run. Ask one focused question at a time when information is missing. Treat the run/profile context as authoritative.'
                : 'You are Aidoraa\'s personal companion. Astrology is disabled for this run. Do not use astrological claims, context, calculations, or guidance. Use the recorded plan and permitted tools; cite grounding IDs in astro_finish_run. Ask one focused question at a time when information is missing.',
          },
          {
            role: 'user',
            content: `Context summary:\n${snapshot.manifestSummary}\n\nSelected context:\n${selectedContextBlock(await loadSelectedItems(runId))}\n\nTool results so far:\n${toolRefs.join('\n') || 'none'}\n\nUser: ${question}\n\nPlan step: ${planStep.objective}`,
          },
          ...manifest.recentMessages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
          ...modelTranscript,
        ];
        const decision = await modelDecisionStep({
          runId,
          profileId: snapshot.run.profile_id,
          userId: snapshot.run.user_id,
          expectedModeEpoch: snapshot.profile.modeEpoch,
          stepKey: key,
          messages,
          forceFinish: agentSteps >= MAX_AGENT_STEPS - 2,
          hasBirthData: Boolean(snapshot.profile.birthDate && snapshot.profile.birthTime && snapshot.profile.lat !== null && snapshot.profile.lng !== null && snapshot.profile.tz),
        });
        agentSteps++;

        const assistantToolMessage: ChatMessage | null = decision.toolCalls.length
          ? { role: 'assistant', content: decision.content, tool_calls: decision.toolCalls }
          : null;
        if (assistantToolMessage) modelTranscript.push(assistantToolMessage);

        if (decision.toolCalls.length > 0) {
          // Execute model-returned calls in order; correctness over parallelism.
          for (let toolIndex = 0; toolIndex < decision.toolCalls.length; toolIndex++) {
            const call = decision.toolCalls[toolIndex];
            const toolKey = decisionStepKey(
              planStepIndex,
              attempt,
              modelPass,
              toolIndex,
              call.function.name,
            );
            let outcome: { ok: boolean; result: unknown; error?: { code: string; message: string } };
            if (call.function.name === 'astro_finish_run') {
              const parsed = parseFinishProposal(call.function.arguments || '{}');
              if (parsed) {
                finishProposal = parsed;
                draft = parsed.answer;
                outcome = { ok: true, result: { accepted: false, note: 'draft captured for verification' } };
              } else {
                outcome = { ok: false, result: null, error: { code: 'invalid_request', message: 'Invalid final-answer proposal.' } };
              }
            } else if (call.function.name.startsWith('atros_')) {
              await claimToolCall({ runId, stepKey: toolKey, toolName: call.function.name });
              outcome = await executeToolStep({
                runId,
                expectedModeEpoch: snapshot.profile.modeEpoch,
                stepKey: toolKey,
                toolName: call.function.name,
                rawArgs: call.function.arguments,
              });
            } else {
              outcome = await executeToolStep({
                runId,
                expectedModeEpoch: snapshot.profile.modeEpoch,
                stepKey: toolKey,
                toolName: call.function.name,
                rawArgs: call.function.arguments,
              });
            }
            agentSteps++;
            if (outcome.ok) {
              toolRefs.push(`${call.function.name}: ${JSON.stringify(outcome.result).slice(0, 300)}`);
            }
            modelTranscript.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
            });
            await emit({
              event: 'tool.completed',
              runId,
              phase: 'analysis',
              tool: call.function.name,
              summary: outcome.ok ? 'tool completed' : (outcome.error?.message ?? 'tool failed'),
            });
            const cp = await checkpointStep({
              runId,
              expectedVersion: version,
              stepKey: toolKey,
              kind: 'tool',
              status: outcome.ok ? 'succeeded' : 'failed',
              toolName: call.function.name,
              inputSummary: call.function.arguments.slice(0, 500),
              outputSummary: outcome.ok ? 'ok' : (outcome.error?.message ?? 'failed'),
              refs: { tool: call.function.name },
              phase: 'analysis',
              checkpoint: { ...checkpoint, lastCompletedStep: toolKey },
            });
            version = cp.version;
            checkpoint.lastCompletedStep = toolKey;
          }
          const cp = await checkpointStep({
            runId,
            expectedVersion: version,
            stepKey: key,
            kind: 'model',
            status: 'succeeded',
            outputSummary: `model=${decision.model ?? 'configured'}; provider=${decision.provider ?? 'configured'}; produced ${decision.toolCalls.length} tool calls`,
            phase: 'analysis',
            checkpoint: { ...checkpoint, planStepIndex },
          });
          version = cp.version;
          checkpoint.planStepIndex = planStepIndex;
          modelPass++;
          continue;
        }

        // No tool calls: treat content as a draft when present.
        if (decision.content) draft = decision.content;
        const cp = await checkpointStep({
          runId,
          expectedVersion: version,
          stepKey: key,
          kind: 'model',
          status: 'succeeded',
          outputSummary: decision.content
            ? `model=${decision.model ?? 'configured'}; provider=${decision.provider ?? 'configured'}; draft candidate`
            : `model=${decision.model ?? 'configured'}; provider=${decision.provider ?? 'configured'}; no output`,
          phase: 'analysis',
          checkpoint: { ...checkpoint, planStepIndex: planStepIndex + 1, lastCompletedStep: key },
        });
        version = cp.version;
        checkpoint.planStepIndex = planStepIndex + 1;
        checkpoint.lastCompletedStep = key;
        break;
      }
      if (draft) break;
    }

    // --- Verification + finalization ---------------------------------------
    if (!draft) {
      await failRun({
        runId,
        expectedVersion: version,
        errorCode: 'agent_step_limit',
        errorMessage: 'run exhausted its step budget without producing a draft',
        resumable: true,
        nextAction: checkpoint.nextAction || 'continue retrieval and analysis',
      });
      return { status: 'failed' as const, errorCode: 'agent_step_limit' };
    }

    await emit({ event: 'phase.changed', runId, phase: 'verification', status: 'active', summary: 'checking the draft against selected evidence' });
    const verified = await verifyDraft({
      runId,
      profileId: snapshot.run.profile_id,
      userId: snapshot.run.user_id,
      expectedModeEpoch: snapshot.profile.modeEpoch,
      draft,
      planGoal: plan.goal,
      runContext: snapshot.manifestSummary,
      selectedContext: selectedContextBlock(await loadSelectedItems(runId)),
      toolRefs: toolRefs.join('\n') || 'none',
    });
    const verification = verified.verification;
    agentSteps++;
    const verificationKey = stepKeyFor(plan.steps.length, checkpoint.rejectedDraftCount, 0, 'verification');
    const verificationCheckpoint = await checkpointStep({
      runId,
      expectedVersion: version,
      stepKey: verificationKey,
      kind: 'verification',
      status: 'succeeded',
      outputSummary: `model=${verified.model ?? 'configured'}; provider=${verified.provider ?? 'configured'}; verdict=${verification.verdict}`,
      refs: {
        verdict: verification.verdict,
        unsupportedClaims: verification.unsupportedClaims,
        requiredEvidenceIds: verification.requiredEvidenceIds,
        reason: verification.reason,
      },
      phase: 'verification',
      checkpoint: { ...checkpoint, lastCompletedStep: verificationKey },
    });
    version = verificationCheckpoint.version;
    checkpoint.lastCompletedStep = verificationKey;
    await emit({
      event: 'tool.completed',
      runId,
      phase: 'verification',
      tool: 'astro_record_verification',
      summary: `verdict=${verification.verdict}`,
    });

    if (verification.verdict !== 'supported') {
      const rejectedDraftCount = checkpoint.rejectedDraftCount + 1;
      if (rejectedDraftCount >= MAX_REJECTED_DRAFTS || agentSteps >= MAX_AGENT_STEPS) {
        await failRun({
          runId,
          expectedVersion: version,
          errorCode: 'agent_step_limit',
          errorMessage: `verification rejected ${rejectedDraftCount} drafts`,
          resumable: true,
          nextAction: verification.unsupportedClaims[0] ?? verification.reason,
        });
        return { status: 'failed' as const, errorCode: 'agent_step_limit' };
      }
      // Budget remains: append actionable gaps, persist the rewind, and let the
      // outer loop execute the plan again in this same workflow run.
      const gapKey = stepKeyFor(plan.steps.length, rejectedDraftCount, 0, 'retrieval_gap');
      const gapItems = await retrieveContext({
        runId,
        query: verification.unsupportedClaims.join('; ') || verification.reason,
        stepKey: gapKey,
      });
      await emit({
        event: 'tool.completed',
        runId,
        phase: 'retrieval',
        tool: 'astro_context_search',
        summary: `${gapItems.length} evidence-gap items selected`,
      });
      const nextCheckpoint: RunCheckpoint = {
        ...checkpoint,
        rejectedDraftCount,
        planStepIndex: 0,
        lastCompletedStep: gapKey,
        evidenceReviewedIds: [
          ...new Set([
            ...checkpoint.evidenceReviewedIds,
            ...gapItems.filter((item) => item.kind === 'evidence').map((item) => item.id),
          ]),
        ].slice(0, 50),
      };
      const cp = await checkpointStep({
        runId,
        expectedVersion: version,
        stepKey: gapKey,
        kind: 'retrieval',
        status: 'succeeded',
        outputSummary: `verification gaps: ${verification.unsupportedClaims.length}`,
        phase: 'retrieval',
        refs: { itemIds: gapItems.map((i) => i.id).slice(0, 25), requiredEvidenceIds: verification.requiredEvidenceIds },
        checkpoint: nextCheckpoint,
      });
      version = cp.version;
      checkpoint = nextCheckpoint;
      continue;
    }

    // Supported: finalize with the model-proposed terminal state.
    const terminalStatus = finishProposal?.terminalStatus ?? 'complete';
    const focusedQuestion = terminalStatus === 'waiting_for_user' ? (finishProposal?.focusedQuestion ?? null) : null;

    const finalCheckpoint: RunCheckpoint = {
      ...checkpoint,
      // The SQL terminal RPC assigns the canonical question ID. The session
      // current_question field, not this pre-publication checkpoint, is read
      // on the next turn.
      focusedQuestion: null,
      lastCompletedStep: 'finalize',
      nextAction: finishProposal?.nextAction ?? '',
    };
    await emit({ event: 'phase.changed', runId, phase: 'responding', status: 'active', summary: 'persisting the verified answer' });
    const outcome = await finalizeRun({
    runId,
    expectedVersion: version,
    stepKey: stepKeyFor(plan.steps.length + 1, 0, 0, 'finalize'),
    checkpoint: finalCheckpoint,
    answer: draft,
    terminalStatus,
    focusedQuestion,
    nextAction: finishProposal?.nextAction,
    sessionPatch:
      terminalStatus === 'complete'
        ? {
            status: 'complete',
            currentGoal: null,
            summaryText: summarizeSession(draft, plan.goal),
            summaryJson: { goal: plan.goal, mode: plan.mode },
            lastMessagePreview: draft.slice(0, 140),
          }
        : {
            status: 'waiting_for_user',
            currentGoal: plan.goal,
            lastMessagePreview: draft.slice(0, 140),
          },
    expectedModeEpoch: snapshot.profile.modeEpoch,
    expectedPrivacyEpoch: snapshot.profile.privacyEpoch,
    });
    void outcome;
    await emit({
      event: 'answer.ready',
      runId,
      phase: 'responding',
      status: terminalStatus,
      summary: `answer persisted (${terminalStatus})`,
    });
    return { status: terminalStatus };
  }
}

// ---------------------------------------------------------------------------
// Small read steps (kept as steps so replay never refetches inconsistently)
// ---------------------------------------------------------------------------

async function loadTriggeringMessage(runId: string): Promise<{ content: string } | null> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(runId);
  if (!run.triggering_message_id) return null;
  const { data } = await store.adminClient
    .from('astro_messages')
    .select('content')
    .eq('id', run.triggering_message_id)
    .maybeSingle();
  return (data as { content: string } | null) ?? null;
}

async function loadPriorSummaries(runId: string): Promise<string> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(runId);
  const summaries = await store.listPriorSessionSummaries(run.profile_id, run.session_id);
  return summaries.map((s) => `- ${s.summaryText}`).join('\n') || 'none';
}

async function loadPlan(runId: string): Promise<RunPlan | null> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(runId);
  return parsePlan(run.plan_json);
}

async function loadManifestForMessages(
  runId: string,
): Promise<{ recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const manifest = await loadContextManifest(store, runId);
  return {
    recentMessages: manifest.recentMessages.map((m) => ({ role: m.role, content: m.content })),
  };
}

async function loadSelectedItems(
  runId: string,
): Promise<SelectedSource[]> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  return store.listSelectedSources(runId);
}

function summarizeSession(answer: string, goal: string): string {
  return `${goal} — resolved. ${answer.slice(0, 280)}`;
}

// Re-export for API routes constructing SSE event labels.
export { ProviderError };
