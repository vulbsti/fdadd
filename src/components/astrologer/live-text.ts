import type { AstrologerRunEvent } from '@/lib/astro/contracts';

/** One frame of the edge stream: the runner's live event as it was posted. */
interface LiveFrame { seq?: number; kind?: string; segment?: number; text?: string | null }

/** Split complete SSE frames off the front of a buffer; returns the remainder. */
export function takeLiveFrames(buffer: string): { frames: LiveFrame[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames: LiveFrame[] = [];
  for (const part of parts) {
    const data = part.split('\n').find((line) => line.startsWith('data: '));
    if (!data) continue;
    try { frames.push(JSON.parse(data.slice(6)) as LiveFrame); } catch { /* malformed frames are skipped, never rendered */ }
  }
  return { frames, rest };
}

/** Live text arrives as the same `answer.delta` event the events route sends, so one reducer applies both. */
export function liveFrameToEvent(runId: string, frame: LiveFrame): AstrologerRunEvent | null {
  if (frame.kind !== 'text_delta' || typeof frame.text !== 'string' || !Number.isInteger(frame.seq)) return null;
  return { event: 'answer.delta', runId, phase: 'responding', segment: frame.segment ?? 0, delta: frame.text, seq: frame.seq };
}

const RECONNECT_MS = 1000;
const MAX_ATTEMPTS = 20;

/**
 * Read a run's streamed text straight from the edge until the runner exits
 * or the caller aborts. Best effort by design: any failure simply ends the
 * watch, and the events route plus the stored answer still complete the chat.
 */
export async function watchLiveText(runId: string, onEvent: (event: AstrologerRunEvent) => void, signal: AbortSignal,
  fetcher: typeof fetch = fetch) {
  let after = 0;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !signal.aborted; attempt++) {
      // A fresh capability per connection; they are short-lived.
      const located = await fetcher(`/api/astrologer/runs/${runId}/live`, { signal });
      if (!located.ok) return;
      const { url, token } = await located.json() as { url: string; token: string };
      const response = await fetcher(`${url}?after=${after}`, { headers: { authorization: `Bearer ${token}` }, signal });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const taken = takeLiveFrames(buffer + decoder.decode(value, { stream: true }));
        buffer = taken.rest;
        for (const frame of taken.frames) {
          if (frame.kind === 'exit') return;
          if (Number.isInteger(frame.seq)) after = Math.max(after, frame.seq as number);
          const event = liveFrameToEvent(runId, frame);
          if (event) onEvent(event);
        }
      }
      // Closed without an exit frame: the connection dropped; resume after the last sequence.
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
    }
  } catch {
    // Aborted or unreachable; the durable path covers the answer.
  }
}
