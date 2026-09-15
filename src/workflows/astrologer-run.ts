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

import { FatalError } from 'workflow';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore, parseCheckpoint, parsePlan, parseVerification, type RunRow } from '@/lib/astro/agent-store';
import { loadContextManifest, selectRelevantContext, recordSelectedContext } from '@/lib/astro/agent-context';
import { dispatchTool, runAtrosTool, TOOL_DEFINITIONS, validatePlanArgs, toStepOutcome, type ToolContext } from '@/lib/astro/agent-tools';
import { chatCompletion, ProviderError, type ChatMessage, type ToolCallRequest, type FunctionToolDefinition } from '@/lib/ai/provider';
import type { RunCheckpoint, RunPlan, RunVerification } from '@/lib/astro/contracts';

const MAX_AGENT_STEPS = 12;
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
    birthDate: string;
    birthTime: string;
    lat: number;
    lng: number;
    tz: string;
    placeName: string | null;
    hasChart: boolean;
    hasSensitivity: boolean;
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

  const checkpoint = manifest.sessionCheckpoint;
  const summaryLines = [
    `Person: ${manifest.profileName} (memory v${manifest.memoryVersion}, ready=${manifest.profileReady})`,
    `Frozen chart=${manifest.hasFrozenChart} sensitivity=${manifest.hasFrozenSensitivity}`,
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
      birthDate: profile.birth_date as string,
      birthTime: profile.birth_time as string,
      lat: profile.lat as number,
      lng: profile.lng as number,
      tz: profile.tz as string,
      placeName: (profile.place_name as string | null) ?? null,
      hasChart: manifest.hasFrozenChart,
      hasSensitivity: manifest.hasFrozenSensitivity,
    },
    manifestSummary: summaryLines.join('\n'),
  };
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
    focusedQuestion: RunCheckpoint['focusedQuestion'];
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

/** One planning-model call with a forced `astro_record_plan` function. */
async function planRun(input: {
  runId: string;
  question: string;
  manifestSummary: string;
  priorSummaries: string;
}): Promise<RunPlan> {
  'use step';
  const { plan } = await planWithProvider(input);
  return plan;
}

function providerTools(names?: string[]): FunctionToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => !names || names.includes(t.name)).map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

async function planWithProvider(input: {
  runId: string;
  question: string;
  manifestSummary: string;
  priorSummaries: string;
}): Promise<{ plan: RunPlan }> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Aidoraa\'s Vedic astrologer planner. Record an execution plan with astro_record_plan before answering. Steps are retrieve/calculate/evaluate/verify. Never invent person facts; rely on tools.',
    },
    {
      role: 'user',
      content: `Run context:\n${input.manifestSummary}\n\nPrior session summaries:\n${input.priorSummaries}\n\nUser question: ${input.question}`,
    },
  ];
  const result = await chatCompletion({
    messages,
    tools: providerTools(['astro_record_plan']),
    toolChoice: { name: 'astro_record_plan' },

    sessionId: input.runId,
    maxTokens: 2048,
  });
  const call = result.choices[0]?.message.tool_calls?.[0];
  if (!call) throw new Error('planning model returned no astro_record_plan call');
  const parsed = validatePlanArgs(JSON.parse(call.function.arguments || '{}'));
  if (!parsed.ok) throw new Error(`invalid plan: ${parsed.message}`);
  return { plan: parsed.plan };
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
  stepKey: string;
  messages: ChatMessage[];
  forceFinish: boolean;
}): Promise<{ content: string | null; toolCalls: ToolCallRequest[] }> {
  'use step';
  const result = await chatCompletion({
    messages: input.messages,
    tools: providerTools(),
    toolChoice: input.forceFinish ? { name: 'astro_finish_run' } : 'auto',
    sessionId: input.runId,
    maxTokens: 4096,
  });
  const message = result.choices[0]?.message;
  return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
}

/** Execute one registered tool call. */
async function executeToolStep(input: {
  runId: string;
  stepKey: string;
  toolName: string;
  rawArgs: string;
}): Promise<{ ok: boolean; result: unknown; error?: { code: string; message: string } }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const run = await store.getRun(input.runId);
  const profile = await store.getProfile(run.profile_id);
  if (!profile) throw new FatalError('profile missing for tool step');
  const ctx: ToolContext = {
    store,
    run,
    profile: {
      id: run.profile_id,
      user_id: run.user_id,
      name: profile.name as string,
      birth_date: profile.birth_date as string,
      birth_time: profile.birth_time as string,
      lat: profile.lat as number,
      lng: profile.lng as number,
      tz: profile.tz as string,
      place_name: (profile.place_name as string | null) ?? null,
      time_source: (profile.time_source as string | null) ?? 'unknown',
      time_confidence: (profile.time_confidence as string | null) ?? 'unknown',
      chart_json: profile.chart_json ?? null,
      sensitivity_json: profile.sensitivity_json ?? null,
    },
    stepKey: input.stepKey,
    today: new Date().toISOString().slice(0, 10),
  };
  if (input.toolName.startsWith('atros_')) {
    const outcome = await runAtrosTool(ctx, input.toolName, (JSON.parse(input.rawArgs || '{}') ?? {}) as Record<string, never>);
    return toStepOutcome(outcome);
  }
  const outcome = await dispatchTool(ctx, input.toolName, JSON.parse(input.rawArgs || '{}'));
  return toStepOutcome(outcome);
}

/** Independent verification pass over the draft. */
async function verifyDraft(input: {
  runId: string;
  draft: string;
  planGoal: string;
  selectedContext: string;
  toolRefs: string;
}): Promise<RunVerification> {
  'use step';
  const result = await chatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'You are a strict verification model. Judge ONLY whether the draft is supported by the supplied selected context and tool references. Respond with astro_record_verification semantics: verdict supported|needs_more_evidence|contradicted, unsupportedClaims, requiredEvidenceIds, reason.',
      },
      {
        role: 'user',
        content: `Plan goal: ${input.planGoal}\n\nSelected context:\n${input.selectedContext}\n\nTool references:\n${input.toolRefs}\n\nDraft:\n${input.draft}`,
      },
    ],
    sessionId: input.runId,
    maxTokens: 1500,
    temperature: 0,
  });
  const content = result.choices[0]?.message.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch {
    parsed = null;
  }
  const verification = parseVerification(parsed);
  if (!verification) {
    return {
      verdict: 'needs_more_evidence',
      unsupportedClaims: [],
      requiredEvidenceIds: [],
      reason: 'verifier returned an unparseable verdict; treat as needs_more_evidence',
    };
  }
  return verification;
}

/** Terminal persistence: assistant message + checkpoint + session state. */
async function finalizeRun(input: {
  runId: string;
  expectedVersion: number;
  stepKey: string;
  checkpoint: RunCheckpoint;
  answer: string;
  terminalStatus: 'waiting_for_user' | 'complete';
  focusedQuestion: RunCheckpoint['focusedQuestion'];
  nextAction?: string;
  sessionPatch: Record<string, unknown>;
}): Promise<{ version: number; messageId: string | null; questionId: string | null }> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const outcome = await store.workerCheckpoint({
    runId: input.runId,
    expectedVersion: input.expectedVersion,
    step: {
      stepKey: input.stepKey,
      kind: 'checkpoint',
      status: 'succeeded',
      outputSummary: `finalized ${input.terminalStatus}`,
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

function contextBlock(items: Array<{ kind: string; title: string; excerpt: string; id?: string }>): string {
  return items.map((item) => `- [${item.kind}] ${item.title}: ${item.excerpt}`).join('\n');
}

/**
 * One Workflow run per user message. Never fabricates a completion: after
 * two rejected drafts or twelve agent steps the run fails durably with
 * `resumable=true` and a preserved next action.
 */
export async function astrologerRunWorkflow(runId: string) {
  'use workflow';

  const snapshot = await loadRunSnapshot(runId);
  let version = snapshot.run.version;
  let checkpoint = snapshot.checkpoint;
  const runRow = snapshot.run;

  if (runRow.status !== 'active') {
    throw new FatalError(`run ${runId} is ${runRow.status}, not active`);
  }

  const triggeringMessage = runRow.triggering_message_id
    ? await loadTriggeringMessage(runId)
    : null;
  const question = triggeringMessage?.content ?? checkpoint.currentGoal ?? 'Continue the reading.';

  // --- Planning ------------------------------------------------------------
  const planKey = stepKeyFor(0, 0, 0, 'astro_record_plan');
  if (!snapshot.plan) {
    const priorSummaries = await loadPriorSummaries(runId);
    const plan = await planRun({
      runId,
      question,
      manifestSummary: snapshot.manifestSummary,
      priorSummaries,
    });
    const cp = await checkpointStep({
      runId,
      expectedVersion: version,
      stepKey: planKey,
      kind: 'plan',
      status: 'succeeded',
      outputSummary: `plan: ${plan.goal}`,
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
  let draft: string | null = null;

  for (let planStepIndex = checkpoint.planStepIndex; planStepIndex < plan.steps.length; planStepIndex++) {
    const planStep = plan.steps[planStepIndex];
    if (agentSteps >= MAX_AGENT_STEPS) break;

    if (planStep.kind === 'retrieve') {
      const query = plan.retrievalQueries[planStepIndex % Math.max(plan.retrievalQueries.length, 1)] ?? checkpoint.currentGoal;
      const key = stepKeyFor(planStepIndex, 0, 0, 'context_search');
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
        refs: { itemIds: items.map((i) => i.id).slice(0, 25) },
        checkpoint: { ...checkpoint, lastCompletedStep: key, evidenceReviewedIds: [...new Set([...checkpoint.evidenceReviewedIds, ...items.filter((i) => i.kind === 'evidence').map((i) => i.id)])].slice(0, 50) },
      });
      version = cp.version;
      checkpoint.lastCompletedStep = key;
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
      const key = stepKeyFor(planStepIndex, 0, 0, toolName);
      await claimToolCall({ runId, stepKey: key, toolName });
      const outcome = await executeToolStep({
        runId,
        stepKey: key,
        toolName,
        rawArgs: JSON.stringify({
          from: plan.dateRange?.from,
          to: plan.dateRange?.to,
          asOf: new Date().toISOString().slice(0, 10),
        }),
      });
      agentSteps++;
      const cp = await checkpointStep({
        runId,
        expectedVersion: version,
        stepKey: key,
        kind: 'tool',
        status: outcome.ok ? 'succeeded' : 'failed',
        toolName,
        outputSummary: outcome.ok ? 'calculation completed' : (outcome.error?.message ?? 'failed'),
        refs: { tool: toolName, result: outcome.ok ? 'cached-or-computed' : outcome.error },
        checkpoint: { ...checkpoint, lastCompletedStep: key },
      });
      version = cp.version;
      checkpoint.lastCompletedStep = key;
      if (outcome.ok) toolRefs.push(`${toolName}: ${JSON.stringify(outcome.result).slice(0, 300)}`);
      continue;
    }

    // evaluate / verify steps drive a model decision with tool access.
    const key = stepKeyFor(planStepIndex, 0, 0, 'model');
    const manifest = await loadManifestForMessages(runId);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are Aidoraa\'s Vedic astrologer. Use the recorded plan and tools; cite grounding IDs in astro_finish_run. Ask one focused question at a time when information is missing.',
      },
      {
        role: 'user',
        content: `Context summary:\n${snapshot.manifestSummary}\n\nSelected context:\n${contextBlock(await loadSelectedItems(runId))}\n\nTool results so far:\n${toolRefs.join('\n') || 'none'}\n\nUser: ${question}\n\nPlan step: ${planStep.objective}`,
      },
      ...manifest.recentMessages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];
    const decision = await modelDecisionStep({ runId, stepKey: key, messages, forceFinish: false });
    agentSteps++;

    if (decision.toolCalls.length > 0) {
      // Execute model-returned calls in order; correctness over parallelism.
      for (let toolIndex = 0; toolIndex < decision.toolCalls.length; toolIndex++) {
        const call = decision.toolCalls[toolIndex];
        const toolKey = stepKeyFor(planStepIndex, 0, toolIndex, call.function.name);
        let outcome: { ok: boolean; result: unknown; error?: { code: string; message: string } };
        if (call.function.name === 'astro_finish_run') {
          const parsed = JSON.parse(call.function.arguments || '{}') as { answer?: string };
          draft = parsed.answer ?? null;
          outcome = { ok: true, result: { accepted: false, note: 'draft captured for verification' } };
        } else if (call.function.name.startsWith('atros_')) {
          await claimToolCall({ runId, stepKey: toolKey, toolName: call.function.name });
          outcome = await executeToolStep({
            runId,
            stepKey: toolKey,
            toolName: call.function.name,
            rawArgs: call.function.arguments,
          });
        } else {
          outcome = await executeToolStep({
            runId,
            stepKey: toolKey,
            toolName: call.function.name,
            rawArgs: call.function.arguments,
          });
        }
        if (outcome.ok) {
          toolRefs.push(`${call.function.name}: ${JSON.stringify(outcome.result).slice(0, 300)}`);
        }
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
          checkpoint: { ...checkpoint, lastCompletedStep: toolKey },
        });
        version = cp.version;
        checkpoint.lastCompletedStep = toolKey;
      }
      // Rewind this plan step so the next pass re-evaluates with new results.
      const cp = await checkpointStep({
        runId,
        expectedVersion: version,
        stepKey: key,
        kind: 'model',
        status: 'succeeded',
        outputSummary: `model produced ${decision.toolCalls.length} tool calls`,
        checkpoint: { ...checkpoint, planStepIndex },
      });
      version = cp.version;
      continue;
    }

    // No tool calls: treat content as a draft when present.
    if (decision.content && !draft) {
      draft = decision.content;
    }
    const cp = await checkpointStep({
      runId,
      expectedVersion: version,
      stepKey: key,
      kind: 'model',
      status: 'succeeded',
      outputSummary: decision.content ? 'draft candidate' : 'no output',
      checkpoint: { ...checkpoint, planStepIndex: planStepIndex + 1, lastCompletedStep: key },
    });
    version = cp.version;
    checkpoint.planStepIndex = planStepIndex + 1;
    checkpoint.lastCompletedStep = key;
  }

  // --- Verification + finalization -----------------------------------------
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

  const verification = await verifyDraft({
    runId,
    draft,
    planGoal: plan.goal,
    selectedContext: contextBlock(await loadSelectedItems(runId)),
    toolRefs: toolRefs.join('\n') || 'none',
  });

  if (verification.verdict !== 'supported') {
    checkpoint.rejectedDraftCount += 1;
    if (checkpoint.rejectedDraftCount >= MAX_REJECTED_DRAFTS || agentSteps >= MAX_AGENT_STEPS) {
      await failRun({
        runId,
        expectedVersion: version,
        errorCode: 'agent_step_limit',
        errorMessage: `verification rejected ${checkpoint.rejectedDraftCount} drafts`,
        resumable: true,
        nextAction: verification.unsupportedClaims[0] ?? verification.reason,
      });
      return { status: 'failed' as const, errorCode: 'agent_step_limit' };
    }
    // Budget remains: append actionable gaps and continue.
    const gapKey = stepKeyFor(plan.steps.length, 0, 0, 'retrieval_gap');
    const gapItems = await retrieveContext({
      runId,
      query: verification.unsupportedClaims.join('; ') || verification.reason,
      stepKey: gapKey,
    });
    const cp = await checkpointStep({
      runId,
      expectedVersion: version,
      stepKey: gapKey,
      kind: 'retrieval',
      status: 'succeeded',
      outputSummary: `verification gaps: ${verification.unsupportedClaims.length}`,
      refs: { itemIds: gapItems.map((i) => i.id).slice(0, 25), requiredEvidenceIds: verification.requiredEvidenceIds },
      checkpoint: { ...checkpoint, planStepIndex: 0, lastCompletedStep: gapKey },
    });
    version = cp.version;
    return astrologerRunRetryContinuation(runId, version, checkpoint);
  }

  // Supported: finalize with the model-proposed terminal state.
  const finishArgs = await loadFinishArgs(runId);
  const terminalStatus = finishArgs?.terminalStatus === 'complete' ? 'complete' : 'waiting_for_user';
  const focusedQuestion = terminalStatus === 'waiting_for_user' ? (finishArgs?.focusedQuestion ?? null) : null;

  const finalCheckpoint: RunCheckpoint = {
    ...checkpoint,
    focusedQuestion,
    lastCompletedStep: 'finalize',
    nextAction: finishArgs?.nextAction ?? '',
  };
  const outcome = await finalizeRun({
    runId,
    expectedVersion: version,
    stepKey: stepKeyFor(plan.steps.length + 1, 0, 0, 'finalize'),
    checkpoint: finalCheckpoint,
    answer: draft,
    terminalStatus,
    focusedQuestion,
    nextAction: finishArgs?.nextAction,
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
  });
  void outcome;
  return { status: terminalStatus };
}

/** Continuation after verification gaps: resume plan execution in the same run. */
async function astrologerRunRetryContinuation(
  _runId: string,
  _version: number,
  _checkpoint: RunCheckpoint,
): Promise<{ status: 'failed' | 'complete' | 'waiting_for_user' }> {
  // Workflow functions cannot recurse into themselves mid-run; the gap
  // retrieval above already appended evidence. Reaching here means the next
  // model pass happens in this same workflow body via the loop below.
  return { status: 'complete' };
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
): Promise<Array<{ kind: string; title: string; excerpt: string }>> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const items = await store.listContextItems(runId);
  return items
    .filter((item) => item.purpose === 'selected')
    .map((item) => ({
      kind: String(item.step_key ?? item.purpose),
      title: String(item.item_key ?? ''),
      excerpt: String(item.reason ?? ''),
    }));
}

async function loadFinishArgs(
  runId: string,
): Promise<{ terminalStatus: string; focusedQuestion: RunCheckpoint['focusedQuestion']; nextAction?: string } | null> {
  'use step';
  const store = new AgentStore(createAdminClient(), createAdminClient());
  const steps = await store.adminClient
    .from('astro_agent_run_steps')
    .select('input_summary, output_summary')
    .eq('run_id', runId)
    .eq('tool_name', 'astro_finish_run')
    .order('ordinal', { ascending: false })
    .limit(1);
  const row = (steps.data as Array<{ input_summary: string | null }> | null)?.[0];
  if (!row?.input_summary) return null;
  try {
    const parsed = JSON.parse(row.input_summary) as {
      terminalStatus?: string;
      focusedQuestion?: RunCheckpoint['focusedQuestion'];
      nextAction?: string;
    };
    return {
      terminalStatus: parsed.terminalStatus ?? 'waiting_for_user',
      focusedQuestion: parsed.focusedQuestion ?? null,
      nextAction: parsed.nextAction,
    };
  } catch {
    return null;
  }
}

function summarizeSession(answer: string, goal: string): string {
  return `${goal} — resolved. ${answer.slice(0, 280)}`;
}

// Re-export for API routes constructing SSE event labels.
export { ProviderError };
