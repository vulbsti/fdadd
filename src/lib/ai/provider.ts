/**
 * Model provider for the astrologer agent loop.
 *
 * Primary: OpenCode Go (`https://opencode.ai/zen/go/v1`, `muse-spark-1.3-contributor`).
 * muse-spark is served over the Responses API (`/responses`); Chat Completions
 * 500s for it, so the Go path translates to/from Chat Completions shape and the
 * agent loop stays unchanged. Key resolution: `OPENCODE_API_KEY`, then
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

function resolveProvider(): ResolvedProvider {
  const goKey = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim();
  if (goKey) {
    return {
      name: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: goKey,
      defaultModel: 'muse-spark-1.3-contributor',
    };
  }
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
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

export function toChatCompletionsToolChoice(choice: ToolChoice): unknown {
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
          .default([]),
      }),
    }),
  ),
});

const DEFAULT_FETCH_TIMEOUT_MS = 45_000;
const MIN_FETCH_TIMEOUT_MS = 5_000;
const MAX_FETCH_TIMEOUT_MS = 120_000;

/** Keep provider stalls shorter than the Workflow retry/recovery window. */
export function resolveProviderTimeoutMs(override?: number, configured?: string): number {
  const parsed = override ?? (configured?.trim() ? Number(configured) : Number.NaN);
  if (!Number.isFinite(parsed)) return DEFAULT_FETCH_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(parsed), MIN_FETCH_TIMEOUT_MS), MAX_FETCH_TIMEOUT_MS);
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const provider = resolveProvider();
  const model =
    options.model ??
    process.env.ASTROLOGER_MODEL?.trim() ??
    process.env.OPENROUTER_MODEL?.trim() ??
    provider.defaultModel;

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
  const fetchWithTimeout = (url: string, init: RequestInit): Promise<Response> =>
    fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

  // Responses is Spark-only on Go (qwen/kimi 200 on chat, 401 on responses).
  // Route by model so overrides keep working on their proven protocol.
  if (provider.name === 'opencode-go' && model.startsWith('muse-spark')) {
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
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
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

  const response = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice
        ? { tool_choice: toChatCompletionsToolChoice(options.toolChoice) }
        : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(provider.name, response.status, body);
  }

  const parsed = ResultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ProviderError(provider.name, 502, `unparseable provider response: ${parsed.error.message}`);
  }
  return { ...parsed.data, provider: provider.name, model };
}
