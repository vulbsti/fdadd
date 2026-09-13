/**
 * Model provider for the astrologer agent loop.
 *
 * Primary: OpenCode Go (`https://opencode.ai/zen/go/v1`, OpenAI-compatible
 * chat completions, `muse-spark-1.3-contributor`). Key resolution order:
 * `OPENCODE_API_KEY` (catalog-canonical name), then `OPENGO_API`, then
 * `OPENROUTER_API_KEY` as an OpenRouter fallback. Model override:
 * `ASTROLOGER_MODEL`, then `OPENROUTER_MODEL`.
 */

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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolChoice?: any;
  temperature?: number;
  maxTokens?: number;
  /** Forwarded as `x-opencode-session` so Go can route + cache per conversation. */
  sessionId?: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chatCompletion(options: ChatCompletionOptions): Promise<any> {
  const provider = resolveProvider();
  const model =
    options.model ??
    process.env.ASTROLOGER_MODEL?.trim() ??
    process.env.OPENROUTER_MODEL?.trim() ??
    provider.defaultModel;

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      'HTTP-Referer': `https://${process.env.VERCEL_URL ?? 'localhost:9002'}`,
      'X-Title': 'Aidoraa Astrologer',
      'User-Agent': 'aidoraa-astrologer/1.0',
      ...(options.sessionId ? { 'x-opencode-session': options.sessionId } : {}),
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(provider.name, response.status, body);
  }

  return response.json();
}
