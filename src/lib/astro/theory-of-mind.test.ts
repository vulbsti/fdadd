import { describe, expect, it } from 'vitest';
import { parseReflection, reflectionMessages, REFLECTION_GUIDANCE } from './theory-of-mind';

describe('theory of mind reflection', () => {
  it('accepts an unchanged decision', () => {
    expect(parseReflection('{"decision":"unchanged","reason":"Small talk only."}')).toEqual({ decision: 'unchanged', reason: 'Small talk only.' });
  });

  it('requires the whole revised theory and what changed', () => {
    expect(parseReflection(JSON.stringify({ decision: 'revise', theory: '# Core picture\n...', changes: 'Added the Priya pattern.' })))
      .toMatchObject({ decision: 'revise', changes: 'Added the Priya pattern.' });
    expect(() => parseReflection('{"decision":"revise","changes":"x"}')).toThrow();
  });

  it('rejects a bloated theory', () => {
    expect(() => parseReflection(JSON.stringify({ decision: 'revise', theory: 'x'.repeat(20_001), changes: 'y' }))).toThrow();
  });

  it('tells the model that unchanged is the normal outcome and to stay Vedic', () => {
    expect(REFLECTION_GUIDANCE).toContain('that is the normal outcome');
    expect(REFLECTION_GUIDANCE).toContain('Vedic astrology only');
  });

  it('leaves chart material out when astrology is off', () => {
    const messages = reflectionMessages({ theory: null, chartSummary: null, today: '2026-09-28',
      session: { id: 's', title: 'Chat', createdAt: '2026-09-28T09:00:00.000Z' },
      messages: [{ id: 'm', sessionId: 's', role: 'user', content: 'Hello', createdAt: '2026-09-28T09:01:00.000Z' }] });
    expect(messages[1].content).toContain('Astrology is off for this person');
    expect(messages[1].content).toContain('(none yet');
  });
});
