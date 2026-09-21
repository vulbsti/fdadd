import { describe, expect, it } from 'vitest';
import {
  toChatCompletionsToolChoice,
  toResponsesInput,
  toResponsesToolChoice,
  resolveProviderTimeoutMs,
} from './provider';

describe('OpenCode/Pi tool protocol compatibility', () => {
  it('bounds provider timeout configuration for durable retry recovery', () => {
    expect(resolveProviderTimeoutMs()).toBe(45_000);
    expect(resolveProviderTimeoutMs(undefined, '30000')).toBe(30_000);
    expect(resolveProviderTimeoutMs(100)).toBe(5_000);
    expect(resolveProviderTimeoutMs(undefined, '999999')).toBe(120_000);
    expect(resolveProviderTimeoutMs(undefined, 'invalid')).toBe(45_000);
  });

  it('normalizes named Responses choices to automatic selection for OpenCode Go', () => {
    expect(toResponsesToolChoice('opencode-go', { name: 'astro_record_plan' })).toBe('auto');
    expect(toResponsesToolChoice('openrouter', { name: 'astro_record_plan' })).toEqual({
      type: 'function',
      name: 'astro_record_plan',
    });
  });

  it('preserves the provider-neutral named choice for Chat Completions', () => {
    expect(toChatCompletionsToolChoice({ name: 'astro_finish_run' })).toEqual({
      type: 'function',
      function: { name: 'astro_finish_run' },
    });
  });

  it('serializes tool calls and results as a continued Responses transcript', () => {
    expect(
      toResponsesInput([
        { role: 'user', content: 'Read the chart.' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'atros_chart', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Read the chart.' },
      { role: 'assistant', content: [] },
      { type: 'function_call', call_id: 'call-1', name: 'atros_chart', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' },
    ]);
  });
});
