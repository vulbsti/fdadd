import { describe, expect, it } from 'vitest';
import {
  toChatCompletionsToolChoice,
  parseChatCompletionPayload,
  resolveProviderTemperature,
  fromAnthropicOutput,
  toAnthropicMessages,
  toAnthropicToolChoice,
  toAnthropicTools,
  usesAnthropicMessages,
  usesResponsesAPI,
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

  it('preserves named choices except on OpenCode Go Chat Completions', () => {
    expect(toChatCompletionsToolChoice('openrouter', { name: 'astro_finish_run' })).toEqual({
      type: 'function',
      function: { name: 'astro_finish_run' },
    });
    expect(toChatCompletionsToolChoice('opencode-go', { name: 'astro_finish_run' })).toBe('auto');
  });

  it('normalizes provider null tool calls to an empty list', () => {
    const parsed = parseChatCompletionPayload({
      choices: [{ message: { content: '{"status":"ok"}', tool_calls: null } }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.choices[0]?.message.tool_calls).toEqual([]);
  });

  it('honors the Go Kimi K2.7 fixed-temperature contract', () => {
    expect(resolveProviderTemperature('opencode-go', 'gpt-6-luna', 0)).toBeUndefined();
    expect(resolveProviderTemperature('opencode-go', 'muse-spark-1.3-contributor', 0)).toBeUndefined();
    expect(resolveProviderTemperature('opencode-go', 'kimi-k2.7-code', 0)).toBe(1);
    expect(resolveProviderTemperature('opencode-go', 'kimi-k3', 0)).toBe(0);
    expect(resolveProviderTemperature('openrouter', 'kimi-k2.7-code', 0)).toBe(0);
  });

  it('routes Qwen through Anthropic messages and translates tools both ways', () => {
    expect(usesAnthropicMessages('qwen3.8-flash')).toBe(true);
    expect(usesAnthropicMessages('kimi-k3')).toBe(false);
    expect(toAnthropicToolChoice({ name: 'person_extract' })).toEqual({ type: 'tool', name: 'person_extract' });
    expect(toAnthropicTools([{
      type: 'function',
      function: { name: 'person_extract', description: 'Extract.', parameters: { type: 'object' } },
    }])).toEqual([{ name: 'person_extract', description: 'Extract.', input_schema: { type: 'object' } }]);
    expect(toAnthropicMessages([
      { role: 'system', content: 'System rules.' },
      { role: 'user', content: 'Source.' },
      { role: 'assistant', content: null, tool_calls: [{
        id: 'call-1', type: 'function', function: { name: 'person_extract', arguments: '{"ok":true}' },
      }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{"accepted":true}' },
    ])).toEqual({
      system: 'System rules.',
      messages: [
        { role: 'user', content: 'Source.' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'person_extract', input: { ok: true } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '{"accepted":true}' }] },
      ],
    });
    expect(fromAnthropicOutput({
      content: [
        { type: 'thinking', thinking: 'hidden' },
        { type: 'text', text: 'Visible' },
        { type: 'tool_use', id: 'call-2', name: 'person_extract', input: { observations: [] } },
      ],
    })).toEqual({ choices: [{ message: {
      content: 'Visible',
      tool_calls: [{ id: 'call-2', type: 'function', function: {
        name: 'person_extract', arguments: '{"observations":[]}',
      } }],
    } }] });
  });

  it('routes the prototype Luna model and Muse fallback through Responses', () => {
    expect(usesResponsesAPI('gpt-6-luna')).toBe(true);
    expect(usesResponsesAPI('muse-spark-1.3-contributor')).toBe(true);
    expect(usesResponsesAPI('glm-5.3-flash')).toBe(false);
    expect(usesResponsesAPI('qwen3.8-flash')).toBe(false);
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
