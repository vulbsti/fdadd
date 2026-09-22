import { describe, expect, it } from 'vitest';
import {
  toChatCompletionsToolChoice,
  toResponsesInput,
  toResponsesToolChoice,
  resolveProviderTimeoutMs,
  resolveProviderRetryDelayMs,
  resolveProviderBaseUrl,
} from './provider';

describe('OpenCode/Pi tool protocol compatibility', () => {
  it('normalizes server-controlled compatible provider endpoints', () => {
    expect(resolveProviderBaseUrl('http://127.0.0.1:19082/v1/', 'https://fallback.invalid'))
      .toBe('http://127.0.0.1:19082/v1');
    expect(resolveProviderBaseUrl(undefined, 'https://fallback.invalid/v1'))
      .toBe('https://fallback.invalid/v1');
    expect(() => resolveProviderBaseUrl('file:///tmp/provider', 'https://fallback.invalid'))
      .toThrow(/HTTP\(S\)/);
    expect(() => resolveProviderBaseUrl('https://secret@example.com/v1', 'https://fallback.invalid'))
      .toThrow(/credentials/);
    expect(() => resolveProviderBaseUrl('https://example.com/v1?route=go', 'https://fallback.invalid'))
      .toThrow(/query string/);
  });

  it('bounds provider timeout configuration for durable retry recovery', () => {
    expect(resolveProviderTimeoutMs()).toBe(45_000);
    expect(resolveProviderTimeoutMs(undefined, '30000')).toBe(30_000);
    expect(resolveProviderTimeoutMs(100)).toBe(5_000);
    expect(resolveProviderTimeoutMs(undefined, '999999')).toBe(120_000);
    expect(resolveProviderTimeoutMs(undefined, 'invalid')).toBe(45_000);
  });

  it('retries only short explicit Retry-After pauses and defers long quota windows', () => {
    const now = Date.parse('2026-09-22T12:00:00Z');
    expect(resolveProviderRetryDelayMs(null, now)).toBeNull();
    expect(resolveProviderRetryDelayMs('2', now)).toBe(5_000);
    expect(resolveProviderRetryDelayMs('60', now)).toBe(60_000);
    expect(resolveProviderRetryDelayMs('120', now)).toBeNull();
    expect(resolveProviderRetryDelayMs('Tue, 22 Sep 2026 12:00:30 GMT', now)).toBe(30_000);
    expect(resolveProviderRetryDelayMs('Tue, 22 Sep 2026 17:00:00 GMT', now)).toBeNull();
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
