import type { AstrologerRunEvent } from '@/lib/astro/contracts';

/** Live view of an active run, built from stream events without refetching the session. */
export interface RunStreamState {
  runId: string;
  segment: number;
  draft: string;
  activity: string | null;
  /** Highest live-event row already applied to the draft. */
  seq: number;
}

export function startRunStream(runId: string): RunStreamState {
  return { runId, segment: 0, draft: '', activity: null, seq: 0 };
}

export function applyRunEvent(state: RunStreamState | null, event: AstrologerRunEvent): RunStreamState | null {
  if (!state || state.runId !== event.runId) return state;
  switch (event.event) {
    case 'answer.delta': {
      // A retried server poll re-sends rows this view has already shown.
      if (event.seq !== undefined && event.seq <= state.seq) return state;
      const seq = event.seq ?? state.seq;
      const segment = event.segment ?? state.segment;
      // A new assistant message segment replaces the draft; tool-call chatter
      // from an earlier segment is not part of the answer.
      const draft = segment === state.segment ? state.draft + (event.delta ?? '') : event.delta ?? '';
      return { ...state, segment, draft, seq };
    }
    case 'tool.started':
      return { ...state, activity: event.summary ?? (event.tool ? `Using ${event.tool}` : state.activity) };
    case 'tool.completed':
    case 'phase.changed':
      return { ...state, activity: event.summary ?? state.activity };
    default:
      return state;
  }
}

/** Server events are data; anything malformed is ignored rather than rendered. */
export function parseRunEventData(data: unknown): AstrologerRunEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as AstrologerRunEvent;
    return parsed && typeof parsed.event === 'string' && typeof parsed.runId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
