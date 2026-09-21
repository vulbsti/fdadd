import { astroFinishRunArgsSchema, validateFocusedQuestion, type AstroFinishRunArgs } from './contracts';

/** Parse the complete model tool-call payload, never the 500-character trace. */
export function parseFinishProposal(rawArguments: string): AstroFinishRunArgs | null {
  let raw: unknown;
  try {
    raw = JSON.parse(rawArguments);
  } catch {
    return null;
  }
  const parsed = astroFinishRunArgsSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.focusedQuestion) {
    const problem = validateFocusedQuestion({
      ...parsed.data.focusedQuestion,
      id: 'pending',
    });
    if (problem) return null;
  }
  return parsed.data;
}
