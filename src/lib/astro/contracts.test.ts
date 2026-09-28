/**
 * Behavioral tests for the durable astrologer contracts.
 * These assert observable behavior — what a consumer of the module sees —
 * not implementation wiring.
 */

import { describe, expect, it } from 'vitest';
import {
  AstrologerRunEventSchema,
  BirthInputSchema,
  FocusedQuestionSchema,
  RunCheckpointSchema,
  StartRunResponseSchema,
  validateFocusedQuestion,
} from '@/lib/astro/contracts';
import { AgentStoreError } from '@/lib/astro/agent-store';

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
