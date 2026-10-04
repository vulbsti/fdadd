import { describe, expect, it, vi } from 'vitest';
import { liveFrameToEvent, takeLiveFrames, watchLiveText } from './live-text';
import { applyRunEvent, startRunStream } from './run-stream-state';

const runId = '10000000-0000-4000-8000-000000000001';
const sse = (frame: Record<string, unknown>) => `id: ${frame.seq}\nevent: ${frame.kind}\ndata: ${JSON.stringify(frame)}\n\n`;
function streamOf(...chunks: string[]) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  } }));
}

describe('live text from the edge stream', () => {
  it('keeps a frame split across network chunks until it is complete', () => {
    const whole = sse({ seq: 1, kind: 'text_delta', segment: 1, text: 'Hello' });
    const first = takeLiveFrames(whole.slice(0, 20));
    expect(first.frames).toEqual([]);
    expect(takeLiveFrames(first.rest + whole.slice(20)).frames).toEqual([{ seq: 1, kind: 'text_delta', segment: 1, text: 'Hello' }]);
    expect(takeLiveFrames(': keepalive\n\ndata: {not json\n\n').frames).toEqual([]);
  });

  it('turns text frames into answer deltas and ignores everything else', () => {
    expect(liveFrameToEvent(runId, { seq: 3, kind: 'text_delta', segment: 2, text: 'hi' }))
      .toEqual({ event: 'answer.delta', runId, phase: 'responding', segment: 2, delta: 'hi', seq: 3 });
    expect(liveFrameToEvent(runId, { seq: 4, kind: 'tool_start' })).toBeNull();
    expect(liveFrameToEvent(runId, { kind: 'text_delta', text: 'no sequence' })).toBeNull();
  });

  it('resumes after the last sequence when the connection drops, and stops at exit', async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/live')) return Response.json({ url: 'https://edge.example/runs/x/stream', token: 't' });
      urls.push(url);
      return urls.length === 1
        ? streamOf(sse({ seq: 1, kind: 'text_delta', segment: 1, text: 'Hel' }), sse({ seq: 2, kind: 'text_delta', segment: 1, text: 'lo' }))
        : streamOf(sse({ seq: 3, kind: 'text_delta', segment: 1, text: ' there' }), sse({ seq: 4, kind: 'exit' }), sse({ seq: 5, kind: 'text_delta', segment: 1, text: 'late' }));
    }) as unknown as typeof fetch;
    let state = startRunStream(runId);
    await watchLiveText(runId, (event) => { state = applyRunEvent(state, event)!; }, new AbortController().signal, fetcher);
    expect(urls).toEqual(['https://edge.example/runs/x/stream?after=0', 'https://edge.example/runs/x/stream?after=2']);
    expect(state.draft).toBe('Hello there');
  });

  it('gives up quietly when no edge is configured, and the same text from both paths is shown once', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const onEvent = vi.fn();
    await watchLiveText(runId, onEvent, new AbortController().signal, fetcher);
    expect(onEvent).not.toHaveBeenCalled();
    let state = startRunStream(runId);
    const delta = liveFrameToEvent(runId, { seq: 1, kind: 'text_delta', segment: 1, text: 'once' })!;
    state = applyRunEvent(applyRunEvent(state, delta), delta)!;
    expect(state.draft).toBe('once');
  });
});
