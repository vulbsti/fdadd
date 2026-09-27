import { describe, expect, it } from 'vitest';
import { applyRunEvent, parseRunEventData, startRunStream } from './run-stream-state';

const runId = '10000000-0000-4000-8000-000000000001';

describe('live run stream state', () => {
  it('appends deltas within a segment and replaces the draft when a new message starts', () => {
    let state = startRunStream(runId);
    state = applyRunEvent(state, { event: 'answer.delta', runId, segment: 1, delta: 'Let me check ' })!;
    state = applyRunEvent(state, { event: 'answer.delta', runId, segment: 1, delta: 'your chart.' })!;
    expect(state.draft).toBe('Let me check your chart.');
    state = applyRunEvent(state, { event: 'answer.delta', runId, segment: 2, delta: 'Your current dasha' })!;
    expect(state).toMatchObject({ segment: 2, draft: 'Your current dasha' });
  });

  it('shows tool activity and ignores events for another run', () => {
    let state = applyRunEvent(startRunStream(runId), { event: 'tool.started', runId, tool: 'atros_timeline', summary: 'Working with your files and context' });
    expect(state?.activity).toBe('Working with your files and context');
    state = applyRunEvent(state, { event: 'answer.delta', runId: '20000000-0000-4000-8000-000000000002', segment: 1, delta: 'x' });
    expect(state?.draft).toBe('');
  });

  it('rejects malformed event data', () => {
    expect(parseRunEventData('{not json')).toBeNull();
    expect(parseRunEventData(JSON.stringify({ runId }))).toBeNull();
    expect(parseRunEventData(JSON.stringify({ event: 'answer.delta', runId, delta: 'a' }))?.delta).toBe('a');
  });
});
