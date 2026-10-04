import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCleanup } from './cleanup-pi-storage.mjs';

const d = (letter) => letter.repeat(64);
const base = 'user/person';

test('removes staged pieces and superseded archives, keeps the latest archive, blobs and active runs', () => {
  const objects = [
    `${base}/run-1/${d('a')}.json`, `${base}/run-1/${d('b')}.json`,
    `${base}/run-1/transfer/${d('b')}/manifest.json`, `${base}/run-1/transfer/${d('b')}/0`,
    `${base}/blobs/${d('c')}`,
    `${base}/run-live/${d('e')}.json`, `${base}/run-live/transfer/${d('f')}/0`,
  ].map((name) => ({ name, bytes: 10 }));
  const receipts = [
    { run_id: 'run-1', sequence: 1, object_path: `${base}/run-1/${d('a')}.json` },
    { run_id: 'run-1', sequence: 2, object_path: `${base}/run-1/${d('b')}.json` },
    { run_id: 'run-live', sequence: 1, object_path: `${base}/run-live/${d('e')}.json` },
  ];
  const plan = planCleanup({ objects, receipts, activeRuns: new Set(['run-live']) });
  assert.deepEqual(plan.remove.map((object) => object.name).sort(), [
    `${base}/run-1/${d('a')}.json`, `${base}/run-1/transfer/${d('b')}/0`, `${base}/run-1/transfer/${d('b')}/manifest.json`].sort());
  assert.deepEqual(plan.receiptsToDelete.map((receipt) => [receipt.run_id, receipt.sequence]), [['run-1', 1]]);
});

test('an archive without any receipt is removed, since nothing can read it', () => {
  const plan = planCleanup({ objects: [{ name: `${base}/run-2/${d('a')}.json`, bytes: 1 }], receipts: [], activeRuns: new Set() });
  assert.equal(plan.remove.length, 1);
});
