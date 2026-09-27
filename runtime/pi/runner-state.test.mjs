import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventQueue, createLoopGuard, digestOf, planCheckpointFiles, shouldCheckpoint } from './runner-state.mjs';

test('loop guard steers, then stops, only on identical repeated calls', () => {
  const guard = createLoopGuard({ warnAt: 3, stopAt: 5 });
  assert.equal(guard.started('read', { path: 'a', offset: 0 }).action, 'ok');
  assert.equal(guard.started('read', { offset: 0, path: 'a' }).action, 'ok');
  assert.equal(guard.started('read', { path: 'a', offset: 0 }).action, 'warn');
  assert.equal(guard.started('read', { path: 'a', offset: 0 }).action, 'ok');
  assert.equal(guard.started('read', { path: 'a', offset: 0 }).action, 'stop');
  assert.equal(guard.started('read', { path: 'b', offset: 0 }).action, 'ok');
  for (let index = 0; index < 50; index++) assert.equal(guard.started('read', { path: `f${index}` }).action, 'ok');
});

test('loop guard stops a long run of failing tools and resets on success', () => {
  const guard = createLoopGuard({ failureWarnAt: 2, failureStopAt: 3 });
  assert.equal(guard.ended(true).action, 'ok');
  assert.equal(guard.ended(true).action, 'warn');
  assert.equal(guard.ended(false).action, 'ok');
  assert.equal(guard.ended(true).action, 'ok');
  assert.equal(guard.ended(true).action, 'warn');
  assert.equal(guard.ended(true).action, 'stop');
});

test('checkpoint files inline small files and upload each large file once', () => {
  const large = Buffer.alloc(5000, 'x');
  const files = [{ path: 'work/small.md', bytes: Buffer.from('note') }, { path: 'outputs/a.md', bytes: large }, { path: 'outputs/b.md', bytes: large }];
  const first = planCheckpointFiles(files, new Set());
  assert.deepEqual(first.entries[0], { path: 'work/small.md', content: 'note' });
  assert.deepEqual(first.entries[1], { path: 'outputs/a.md', digest: digestOf(large), bytes: 5000 });
  assert.equal(first.toUpload.length, 1);
  const second = planCheckpointFiles(files, new Set([digestOf(large)]));
  assert.equal(second.toUpload.length, 0);
});

test('checkpoints happen at run end and at most once per interval during turns', () => {
  assert.equal(shouldCheckpoint('turn_end', 0, 10_000), false);
  assert.equal(shouldCheckpoint('turn_end', 1_000, 20_000), false);
  assert.equal(shouldCheckpoint('turn_end', 1_000, 50_000), true);
  assert.equal(shouldCheckpoint('agent_end', 49_000, 50_000), true);
  assert.equal(shouldCheckpoint('final', 49_000, 50_000), true);
});

test('event queue merges adjacent text of one segment and keeps order across flushes', async () => {
  const sent = [];
  const queue = createEventQueue(async (batch) => { sent.push(...batch.map((event) => ({ ...event }))); });
  queue.push({ kind: 'text_delta', segment: 1, text: 'Hel' });
  queue.push({ kind: 'text_delta', segment: 1, text: 'lo' });
  queue.push({ kind: 'tool_start', toolName: 'read', toolCallId: 'c1' });
  queue.push({ kind: 'text_delta', segment: 2, text: 'Answer' });
  await queue.flush();
  queue.push({ kind: 'exit', isError: false });
  await queue.flush();
  assert.deepEqual(sent.map((event) => [event.seq, event.kind, event.text]), [
    [1, 'text_delta', 'Hello'], [2, 'tool_start', null], [3, 'text_delta', 'Answer'], [4, 'exit', null],
  ]);
});

test('event queue retries a failed batch on the next flush', async () => {
  let fail = true;
  const sent = [];
  const queue = createEventQueue(async (batch) => { if (fail) { fail = false; throw new Error('offline'); } sent.push(...batch); });
  queue.push({ kind: 'tool_start', toolName: 'read', toolCallId: 'c1' });
  await assert.rejects(queue.flush(), /offline/);
  await queue.flush();
  assert.equal(sent.length, 1);
});
