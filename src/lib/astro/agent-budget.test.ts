import { describe, expect, it } from 'vitest';
import { resolveAgentFinishMode } from './agent-budget';

describe('resolveAgentFinishMode', () => {
  it('keeps normal tools before the reserved finish budget', () => {
    expect(resolveAgentFinishMode(9, 16, 3)).toBe('normal');
  });

  it('reserves two bounded tool-based finish attempts', () => {
    expect(resolveAgentFinishMode(10, 16, 3)).toBe('tool');
    expect(resolveAgentFinishMode(12, 16, 3)).toBe('tool');
  });

  it('removes tools for the final model answer', () => {
    expect(resolveAgentFinishMode(14, 16, 3)).toBe('text');
    expect(resolveAgentFinishMode(15, 16, 3)).toBe('text');
  });
});
