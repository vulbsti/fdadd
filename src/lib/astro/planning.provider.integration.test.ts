import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chatCompletion } from '@/lib/ai/provider';
import { TOOL_DEFINITIONS, validatePlanArgs } from './agent-tools';

const liveIt = process.env.P3_PROVIDER_CANARY === '1' ? it : it.skip;

describe('prototype planning provider', () => {
  liveIt('Luna returns an exact typed Atros calculation plan', async () => {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.name === 'astro_record_plan');
    expect(definition).toBeTruthy();
    const result = await chatCompletion({
      model: 'gpt-6-luna',
      messages: [
        {
          role: 'system',
          content: 'Astrology is enabled and birth data is complete. Call astro_record_plan. Every calculate step must include the exact typed calculation.',
        },
        {
          role: 'user',
          content: 'What is my current dasha, and how should I understand it without deterministic claims?',
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: definition!.name,
          description: definition!.description,
          parameters: definition!.parameters,
        },
      }],
      toolChoice: 'auto',
      sessionId: `p3-plan-${randomUUID()}`,
      maxTokens: 2_000,
      timeoutMs: 120_000,
    });
    const call = result.choices[0]?.message.tool_calls.find((item) => item.function.name === 'astro_record_plan');
    expect(call).toBeTruthy();
    const parsed = validatePlanArgs(JSON.parse(call!.function.arguments));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const calculation = parsed.plan.steps.find((step) => step.kind === 'calculate');
    expect(calculation).toMatchObject({
      kind: 'calculate',
      calculation: { tool: 'atros_current_dasha', args: {} },
    });
  }, 130_000);
});
