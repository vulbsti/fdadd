import { createHash } from 'node:crypto';

// Pure helpers for runner.mjs, kept separate so they can be tested without a VM.

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * No-progress detection. The same tool call with the same arguments, or a run
 * of failing tool calls, first earns a steering note and then stops the run
 * with its work preserved. Distinct calls are never limited.
 */
export function createLoopGuard({ warnAt = 3, stopAt = 5, failureWarnAt = 4, failureStopAt = 8 } = {}) {
  let lastKey = null;
  let repeats = 0;
  let failures = 0;
  return {
    started(toolName, args) {
      const key = `${toolName}:${stable(args)}`;
      repeats = key === lastKey ? repeats + 1 : 1;
      lastKey = key;
      if (repeats >= stopAt) return { action: 'stop', reason: `the same ${toolName} call was repeated ${repeats} times` };
      if (repeats === warnAt) return { action: 'warn', reason: `you have made the same ${toolName} call ${repeats} times with identical arguments` };
      return { action: 'ok' };
    },
    ended(isError) {
      failures = isError ? failures + 1 : 0;
      if (failures >= failureStopAt) return { action: 'stop', reason: `${failures} tool calls failed in a row` };
      if (isError && failures === failureWarnAt) return { action: 'warn', reason: `${failures} tool calls have failed in a row` };
      return { action: 'ok' };
    },
  };
}

export function digestOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Build checkpoint file entries. Small files are inlined; larger ones become
 * content-addressed references, and only digests not yet uploaded for this
 * person are returned for upload.
 */
export function planCheckpointFiles(files, uploaded, inlineLimit = 2048) {
  const entries = [];
  const toUpload = new Map();
  for (const file of files) {
    if (file.bytes.length <= inlineLimit) {
      entries.push({ path: file.path, content: file.bytes.toString('utf8') });
      continue;
    }
    const digest = digestOf(file.bytes);
    entries.push({ path: file.path, digest, bytes: file.bytes.length });
    if (!uploaded.has(digest)) toUpload.set(digest, file.bytes);
  }
  return { entries, toUpload: [...toUpload].map(([digest, bytes]) => ({ digest, bytes })) };
}

/** Checkpoint at the end of the run, and at most once per interval otherwise. */
export function shouldCheckpoint(trigger, lastCheckpointAt, now, minIntervalMs = 45_000) {
  if (trigger === 'final' || trigger === 'exit') return true;
  if (trigger === 'agent_end') return true;
  return trigger === 'turn_end' && now - lastCheckpointAt >= minIntervalMs;
}

const MAX_TEXT = 16_000;

/**
 * Ordered live-event queue. Adjacent text deltas of the same message segment
 * are merged before sending, so a flush carries a few rows, not every token.
 */
export function createEventQueue(send, { startSeq = 0 } = {}) {
  let seq = startSeq;
  let pending = [];
  let inflight = Promise.resolve();
  return {
    get seq() { return seq; },
    push(event) {
      const last = pending.at(-1);
      if (event.kind === 'text_delta' && last?.kind === 'text_delta' && last.segment === event.segment
        && last.text.length + event.text.length <= MAX_TEXT) {
        last.text += event.text;
        return;
      }
      if (event.kind === 'text_delta' && event.text.length > MAX_TEXT) {
        for (let index = 0; index < event.text.length; index += MAX_TEXT) {
          pending.push({ ...event, seq: ++seq, text: event.text.slice(index, index + MAX_TEXT) });
        }
        return;
      }
      pending.push({ segment: 0, toolName: null, toolCallId: null, isError: false, text: null, ...event, seq: ++seq });
    },
    flush() {
      inflight = inflight.catch(() => {}).then(async () => {
        while (pending.length) {
          const batch = pending.slice(0, 100);
          await send(batch);
          pending = pending.slice(batch.length);
        }
      });
      return inflight;
    },
  };
}
