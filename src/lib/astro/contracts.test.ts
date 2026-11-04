import { describe, expect, it } from 'vitest';
import { FocusedQuestionSchema, validateFocusedQuestion } from '@/lib/astro/contracts';

const UUID = '11111111-1111-4111-8111-111111111111';

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
