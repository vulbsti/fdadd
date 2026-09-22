export type AgentFinishMode = 'normal' | 'tool' | 'text';

/**
 * Reserve bounded tool-based finish attempts, then force the final provider
 * call to plain text. This keeps providers that only support automatic tool
 * choice from exhausting the run by repeatedly ignoring or malforming the
 * finish call.
 */
export function resolveAgentFinishMode(
  agentSteps: number,
  maxSteps: number,
  forcedFinishAttempts: number,
): AgentFinishMode {
  if (agentSteps >= maxSteps - 2) return 'text';
  if (agentSteps >= maxSteps - (forcedFinishAttempts * 2)) return 'tool';
  return 'normal';
}
