export class OpenRouterError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`OpenRouter request failed with status ${status}: ${body}`);
    this.name = 'OpenRouterError';
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chatCompletion(options: ChatCompletionOptions): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'OpenRouter is not configured. Set OPENROUTER_API_KEY.'
    );
  }

  const model =
    options.model ?? process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': `https://${process.env.VERCEL_URL ?? 'localhost:9002'}`,
      'X-Title': 'Aidoraa Astrologer',
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
    throw new OpenRouterError(response.status, body);
  }

  return response.json();
}
