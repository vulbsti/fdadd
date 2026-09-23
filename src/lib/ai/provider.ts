/**
 * Model provider for the astrologer agent loop.
 *
 * Primary: OpenCode Go (`https://opencode.ai/zen/go/v1`, `gpt-6-luna`).
 * Luna and Muse are served over the Responses API (`/responses`), so the Go
 * path translates to/from the neutral Chat Completions shape and the agent
 * loop stays unchanged. Key resolution: `OPENCODE_API_KEY`, then
 * `OPENGO_API`, then `OPENROUTER_API_KEY` (OpenRouter Chat Completions fallback).
 * Model override: `ASTROLOGER_MODEL`, then `OPENROUTER_MODEL`.
 */

import { z } from 'zod';

export class ProviderError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(provider: string, status: number, body: string) {
    super(`${provider} request failed with status ${status}: ${body}`);
    this.name = 'ProviderError';
    this.status = status;
    this.body = body;
  }
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface FunctionToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRequest[];
}

export type ToolChoice = 'auto' | 'required' | 'none' | { name: string };

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  tools?: FunctionToolDefinition[];
  toolChoice?: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  /** Ask compatible Chat Completions providers to enforce a JSON object. */
  responseFormat?: { type: 'json_object' };
  /** Disable optional model reasoning when a bounded structured job needs predictable latency. */
  reasoningMode?: 'default' | 'disabled';
  /** Forwarded as `x-opencode-session` so Go can route + cache per conversation. */
  sessionId?: string;
  /** Bounded fetch timeout in milliseconds. */
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  choices: Array<{
    message: { content: string | null; tool_calls: ToolCallRequest[] };
  }>;
  /** Safe request metadata for operational traces; never model reasoning. */
  provider?: string;
  model?: string;
}

interface ResolvedProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

/**
 * Resolve a server-controlled compatible endpoint without permitting URL
 * credentials or non-HTTP transports. Besides self-hosted gateways, this is
 * the seam used by the local fault proxy in the provider recovery E2E.
 */
export function resolveProviderBaseUrl(configured: string | undefined, fallback: string): string {
  const candidate = configured?.trim() || fallback;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Provider base URL must be an HTTP(S) URL without embedded credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Provider base URL must not include a query string or fragment.');
  }
  return candidate.replace(/\/+$/, '');
}

function resolveProvider(): ResolvedProvider {
  const goKey = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim();
  if (goKey) {
    return {
      name: 'opencode-go',
      baseUrl: resolveProviderBaseUrl(
        process.env.OPENGO_BASE_URL,
        'https://opencode.ai/zen/go/v1',
      ),
      apiKey: goKey,
      defaultModel: 'gpt-6-luna',
    };
  }
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      name: 'openrouter',
      baseUrl: resolveProviderBaseUrl(
        process.env.OPENROUTER_BASE_URL,
        'https://openrouter.ai/api/v1',
      ),
      apiKey: openRouterKey,
      defaultModel: 'anthropic/claude-sonnet-4',
    };
  }
  throw new Error(
    'No model provider configured. Set OPENGO_API (OpenCode Go) or OPENROUTER_API_KEY.'
  );
}

type ResponsesInputItem =
  | { type: 'function_call_output'; call_id: string; output: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'output_text'; text: string }> };

function toResponsesTools(tools: FunctionToolDefinition[]): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

interface ResponsesOutputItem {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface ResponsesResponse {
  output?: ResponsesOutputItem[];
}

interface AnthropicMessagesResponse {
  model?: string;
  content?: Array<
    | { type: 'text'; text?: string }
    | { type: 'thinking'; thinking?: string }
    | { type: 'tool_use'; id?: string; name?: string; input?: unknown }
  >;
}

function fromResponsesOutput(response: ResponsesResponse): ChatCompletionResult {
  let text = '';
  const toolCalls: ToolCallRequest[] = [];
  for (const item of response.output ?? []) {
    if (item.type === 'function_call' && item.call_id && item.name) {
      toolCalls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments ?? '{}' },
      });
    } else if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && part.text) text += part.text;
      }
    }
  }
  return { choices: [{ message: { content: text || null, tool_calls: toolCalls } }] };
}

export function usesAnthropicMessages(model: string): boolean {
  return /^qwen3\./.test(model) || /^minimax-m/.test(model);
}

/** Models in the prototype allowlist that OpenCode Go serves via Responses. */
export function usesResponsesAPI(model: string): boolean {
  return model === 'gpt-6-luna' || model.startsWith('muse-spark');
}

export function toAnthropicMessages(messages: ChatMessage[]) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content ?? '')
    .filter(Boolean)
    .join('\n\n');
  const converted = messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{ type: 'tool_result' as const, tool_use_id: message.tool_call_id ?? '', content: message.content ?? '' }],
        };
      }
      if (message.role === 'assistant' && message.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
            ...message.tool_calls.map((call) => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.function.name,
              input: JSON.parse(call.function.arguments || '{}') as unknown,
            })),
          ],
        };
      }
      return { role: message.role as 'user' | 'assistant', content: message.content ?? '' };
    });
  return { system, messages: converted };
}

export function toAnthropicTools(tools: FunctionToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

export function toAnthropicToolChoice(choice: ToolChoice): unknown {
  if (choice === 'required') return { type: 'any' };
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  return { type: 'tool', name: choice.name };
}

export function fromAnthropicOutput(response: AnthropicMessagesResponse): ChatCompletionResult {
  let text = '';
  const toolCalls: ToolCallRequest[] = [];
  for (const item of response.content ?? []) {
    if (item.type === 'text' && item.text) text += item.text;
    if (item.type === 'tool_use' && item.id && item.name) {
      toolCalls.push({
        id: item.id,
        type: 'function',
        function: { name: item.name, arguments: JSON.stringify(item.input ?? {}) },
      });
    }
  }
  return { choices: [{ message: { content: text || null, tool_calls: toolCalls } }] };
}

/** Map the neutral ToolChoice to each provider's wire shape. */
export function toResponsesToolChoice(providerName: string, choice: ToolChoice): unknown {
  // OpenCode Go's Responses endpoint currently accepts only the automatic
  // mode. Pi/OMP leave this field unset, which has the same behavior. Keep
  // the neutral named-choice API for providers that support it, but never
  // emit a named/required/none choice to OpenCode Go.
  if (providerName === 'opencode-go') return 'auto';
  if (typeof choice === 'string') return choice;
  return { type: 'function', name: choice.name };
}

export function toChatCompletionsToolChoice(providerName: string, choice: ToolChoice): unknown {
  // Go's routed thinking models reject named and required tool choices on the
  // Chat Completions route as well. Auto still exposes the exact tool schema;
  // callers validate the returned function name before accepting its output.
  if (providerName === 'opencode-go') return 'auto';
  if (typeof choice === 'string') return choice;
  return { type: 'function', function: { name: choice.name } };
}

/**
 * Internal Responses transcript shape. Exported for a focused compatibility
 * test: tool results must be sent as function_call_output items on the next
 * model turn, exactly as Pi/OMP do.
 */
export function toResponsesInput(messages: ChatMessage[]): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id ?? '',
        output: message.content ?? '',
      });
    } else if (message.role === 'assistant' && message.tool_calls?.length) {
      input.push({
        role: 'assistant',
        content: message.content ? [{ type: 'output_text', text: message.content }] : [],
      });
      for (const call of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments || '{}',
        });
      }
    } else {
      input.push({ role: message.role, content: message.content ?? '' });
    }
  }
  return input;
}

const ResultSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .nullish()
          .transform((value) => value ?? []),
      }),
    }),
  ),
});

export function parseChatCompletionPayload(value: unknown) {
  return ResultSchema.safeParse(value);
}

export function resolveProviderTemperature(
  providerName: string,
  model: string,
  requested: number | undefined,
): number | undefined {
  // Go's Responses reasoning models reject the temperature parameter.
  if (providerName === 'opencode-go' && usesResponsesAPI(model)) return undefined;
  // Go's Kimi K2.7 Code route rejects every explicit temperature except 1.
  if (providerName === 'opencode-go' && model === 'kimi-k2.7-code') return 1;
  return requested;
}

const DEFAULT_FETCH_TIMEOUT_MS = 45_000;
const MIN_FETCH_TIMEOUT_MS = 5_000;
const MAX_FETCH_TIMEOUT_MS = 120_000;

/** Keep provider stalls shorter than the Workflow retry/recovery window. */
export function resolveProviderTimeoutMs(override?: number, configured?: string): number {
  const parsed = override ?? (configured?.trim() ? Number(configured) : Number.NaN);
  if (!Number.isFinite(parsed)) return DEFAULT_FETCH_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(parsed), MIN_FETCH_TIMEOUT_MS), MAX_FETCH_TIMEOUT_MS);
}

/**
 * Retry once only when the provider supplies a short, actionable cooldown.
 * Missing or long-window limits belong to the durable job/run retry policy;
 * retrying them immediately only multiplies quota pressure.
 */
export function resolveProviderRetryDelayMs(retryAfter: string | null, nowMs = Date.now()): number | null {
  if (!retryAfter?.trim()) return null;
  const seconds = Number(retryAfter);
  const requestedMs = Number.isFinite(seconds)
    ? Math.ceil(seconds * 1_000)
    : Date.parse(retryAfter) - nowMs;
  if (!Number.isFinite(requestedMs) || requestedMs > 60_000) return null;
  return Math.max(requestedMs, 5_000);
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const provider = resolveProvider();
  const model =
    options.model ??
    process.env.ASTROLOGER_MODEL?.trim() ??
    process.env.OPENROUTER_MODEL?.trim() ??
    provider.defaultModel;
  const temperature = resolveProviderTemperature(provider.name, model, options.temperature);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
    'HTTP-Referer': `https://${process.env.VERCEL_URL ?? 'localhost:9002'}`,
    'X-Title': 'Aidoraa Astrologer',
    'User-Agent': 'aidoraa-astrologer/1.0',
    ...(options.sessionId ? { 'x-opencode-session': options.sessionId } : {}),
    // Match the installed Pi/OMP OpenCode Go adapter's routing hint.
    ...(provider.name === 'opencode-go' ? { 'x-opencode-client': 'pi' } : {}),
  };
  const timeoutMs = resolveProviderTimeoutMs(
    options.timeoutMs,
    process.env.ASTROLOGER_PROVIDER_TIMEOUT_MS,
  );
  const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
    const request = () => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const first = await request();
    if (first.status !== 429) return first;
    const delayMs = resolveProviderRetryDelayMs(first.headers.get('retry-after'));
    if (delayMs === null) return first;
    await first.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return request();
  };

  // Go exposes model families on different wire protocols. Route by model so
  // overrides use the endpoint documented for that family.
  if (provider.name === 'opencode-go' && usesResponsesAPI(model)) {
    const response = await fetchWithTimeout(`${provider.baseUrl}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: toResponsesInput(options.messages),
        ...(options.tools ? { tools: toResponsesTools(options.tools) } : {}),
        ...(options.toolChoice
          ? { tool_choice: toResponsesToolChoice(provider.name, options.toolChoice) }
          : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        // Reasoning models burn budget before emitting: default generously.
        max_output_tokens: options.maxTokens ?? 4096,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderError(provider.name, response.status, body);
    }
    return {
      ...fromResponsesOutput((await response.json()) as ResponsesResponse),
      provider: provider.name,
      model,
    };
  }

  if (provider.name === 'opencode-go' && usesAnthropicMessages(model)) {
    const converted = toAnthropicMessages(options.messages);
    const response = await fetchWithTimeout(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: { ...headers, 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 4096,
        ...(converted.system ? { system: converted.system } : {}),
        messages: converted.messages,
        ...(options.tools ? { tools: toAnthropicTools(options.tools) } : {}),
        ...(options.toolChoice ? { tool_choice: toAnthropicToolChoice(options.toolChoice) } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(options.reasoningMode === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderError(provider.name, response.status, body);
    }
    return {
      ...fromAnthropicOutput((await response.json()) as AnthropicMessagesResponse),
      provider: provider.name,
      model,
    };
  }

  const response = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice
        ? { tool_choice: toChatCompletionsToolChoice(provider.name, options.toolChoice) }
        : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(provider.name, response.status, body);
  }

  const parsed = parseChatCompletionPayload(await response.json());
  if (!parsed.success) {
    throw new ProviderError(provider.name, 502, `unparseable provider response: ${parsed.error.message}`);
  }
  return { ...parsed.data, provider: provider.name, model };
}
