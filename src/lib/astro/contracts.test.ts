/**
 * Behavioral tests for the durable astrologer contracts and policy helpers.
 * These assert observable behavior — what a consumer of the module sees —
 * not implementation wiring.
 */

import { describe, expect, it } from 'vitest';
import {
  AstrologerRunEventSchema,
  BirthInputSchema,
  FocusedQuestionSchema,
  RunCheckpointSchema,
  RunPlanSchema,
  RunVerificationSchema,
  StartRunResponseSchema,
  validateFocusedQuestion,
} from '@/lib/astro/contracts';
import { parseCheckpoint, parseVerification } from '@/lib/astro/agent-store';
import { AgentStoreError } from '@/lib/astro/agent-store';
import { validatePlanArgs } from '@/lib/astro/agent-tools';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('BirthInput', () => {
  it('accepts a valid birth payload', () => {
    const parsed = BirthInputSchema.safeParse({
      name: 'Ravi', date: '1990-01-01', time: '06:30',
      latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an impossible latitude', () => {
    const parsed = BirthInputSchema.safeParse({
      name: 'Ravi', date: '1990-01-01', time: '06:30',
      latitude: 95, longitude: 77.59, timezone: 'Asia/Kolkata',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const parsed = BirthInputSchema.safeParse({
      name: 'Ravi', date: '01/01/1990', time: '06:30',
      latitude: 12, longitude: 77, timezone: 'UTC',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('RunPlan', () => {
  it('requires at least one step and a known mode', () => {
    expect(
      RunPlanSchema.safeParse({ goal: 'g', mode: 'timing', steps: [] }).success,
    ).toBe(false);
    expect(
      RunPlanSchema.safeParse({ goal: 'g', mode: 'silly', steps: [{ key: 'a', kind: 'retrieve', objective: 'o' }] }).success,
    ).toBe(false);
    expect(
      RunPlanSchema.safeParse({ goal: 'g', mode: 'timing', steps: [{ key: 'a', kind: 'retrieve', objective: 'o' }] }).success,
    ).toBe(true);
  });

  it('requires an exact typed Atros request for calculation steps', () => {
    expect(RunPlanSchema.safeParse({
      goal: 'current timing', mode: 'timing',
      steps: [{ key: 'calculate', kind: 'calculate', objective: 'Inspect current dasha' }],
    }).success).toBe(false);
    expect(RunPlanSchema.safeParse({
      goal: 'current timing', mode: 'timing',
      steps: [{
        key: 'calculate', kind: 'calculate', objective: 'Inspect current dasha',
        calculation: { tool: 'atros_current_dasha', args: {} },
      }],
    }).success).toBe(true);
    expect(RunPlanSchema.safeParse({
      goal: 'timing window', mode: 'timing',
      steps: [{
        key: 'calculate', kind: 'calculate', objective: 'Inspect timeline',
        calculation: { tool: 'atros_timeline', args: { from: '2026-10-01', to: '2026-09-01', level: 'antar' } },
      }],
    }).success).toBe(false);
  });

  it('host-bounds a provider plan with one terminal evaluation step', () => {
    const parsed = validatePlanArgs({
      plan: {
        goal: 'understand the person',
        mode: 'profile_understanding',
        steps: [
          { key: 'r1', kind: 'retrieve', objective: 'Find context' },
          { key: 'v1', kind: 'verify', objective: 'Provider-proposed verification' },
          { key: 'r2', kind: 'retrieve', objective: 'Find another relevant account' },
        ],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.steps).toEqual([
      { key: 'r1', kind: 'retrieve', objective: 'Find context' },
      { key: 'r2', kind: 'retrieve', objective: 'Find another relevant account' },
      { key: 'answer', kind: 'evaluate', objective: 'Answer from the collected person context and calculation evidence.' },
    ]);
  });
});

describe('RunVerification', () => {
  it('parses a supported verdict with defaults', () => {
    const parsed = RunVerificationSchema.parse({
      verdict: 'supported', reason: 'all claims grounded',
    });
    expect(parsed.unsupportedClaims).toEqual([]);
    expect(parsed.requiredEvidenceIds).toEqual([]);
  });

  it('rejects an unknown verdict', () => {
    expect(
      RunVerificationSchema.safeParse({ verdict: 'vibes', reason: 'x' }).success,
    ).toBe(false);
  });
});

describe('focused question policy', () => {
  const base = {
    id: UUID, prompt: 'Exact birth time?',
    responseKind: 'single_choice' as const, allowFreeText: true,
  };

  it('rectification question passes with exactly one control option', () => {
    const question = FocusedQuestionSchema.parse({
      ...base,
      options: [
        { id: 'a', label: '06:30', kind: 'answer' },
        { id: 'ctl', label: 'I am not sure', kind: 'control' },
      ],
    });
    expect(validateFocusedQuestion(question)).toBeNull();
  });

  it('rejects two control options', () => {
    const question = FocusedQuestionSchema.parse({
      ...base,
      options: [
        { id: 'ctl1', label: 'Not sure', kind: 'control' },
        { id: 'ctl2', label: 'Skip', kind: 'control' },
      ],
    });
    expect(validateFocusedQuestion(question)).toMatch(/control/);
  });

  it('rejects single_choice with fewer than two options', () => {
    const question = FocusedQuestionSchema.parse({
      ...base,
      options: [{ id: 'a', label: '06:30', kind: 'answer' }],
    });
    expect(validateFocusedQuestion(question)).toMatch(/two options/);
  });
});

describe('checkpoint parsing', () => {
  it('reconstructs a waiting checkpoint with defaults for missing fields', () => {
    const checkpoint = parseCheckpoint({
      currentGoal: 'rectify birth time',
      focusedQuestion: { id: UUID, prompt: 'p', responseKind: 'free_text', options: [], allowFreeText: true },
      evidenceReviewedIds: [UUID],
    });
    expect(checkpoint.currentGoal).toBe('rectify birth time');
    expect(checkpoint.focusedQuestion?.id).toBe(UUID);
    expect(checkpoint.planStepIndex).toBe(0);
    expect(checkpoint.rejectedDraftCount).toBe(0);
    expect(checkpoint.evidenceReviewedIds).toEqual([UUID]);
  });

  it('treats a non-object checkpoint as empty', () => {
    const checkpoint = parseCheckpoint(null);
    expect(checkpoint.currentGoal).toBe('');
    expect(checkpoint.activeHypothesisIds).toEqual([]);
  });
});

describe('verification parsing', () => {
  it('returns null for garbage so the caller can fail safe', () => {
    expect(parseVerification('not an object')).toBeNull();
    expect(parseVerification({ verdict: 'maybe' })).toBeNull();
  });
});

describe('stream event parsing', () => {
  it('accepts the documented event names with payloads', () => {
    const parsed = AstrologerRunEventSchema.parse({
      event: 'tool.completed', runId: UUID, tool: 'atros_timeline', cacheHit: true,
    });
    expect(parsed.cacheHit).toBe(true);
  });

  it('rejects undocumented event names', () => {
    expect(
      AstrologerRunEventSchema.safeParse({ event: 'thought.process', runId: UUID }).success,
    ).toBe(false);
  });
});

describe('start-run response', () => {
  it('validates a 202 DTO', () => {
    const parsed = StartRunResponseSchema.parse({
      runId: UUID, messageId: UUID, status: 'active',
      eventsUrl: '/api/astrologer/runs/x/events', replayed: false,
    });
    expect(parsed.status).toBe('active');
  });
});

describe('RunCheckpoint schema', () => {
  it('defaults a fresh checkpoint', () => {
    const checkpoint = RunCheckpointSchema.parse({});
    expect(checkpoint.contextVersion).toBe(0);
    expect(checkpoint.focusedQuestion).toBeNull();
  });
});

describe('error normalization', () => {
  it('maps codes to the shared DTO shape', () => {
    const dto = new AgentStoreError('quota_exceeded', 'limit reached').toDto(UUID, true);
    expect(dto).toEqual({
      code: 'quota_exceeded', message: 'limit reached', runId: UUID, resumable: true,
    });
  });
});
