import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeObject, signEdgeToken, verifyEdgeToken } from './token.mjs';

const secret = 'test-secret';
const userId = '20000000-0000-4000-8000-000000000002';
const personId = '30000000-0000-4000-8000-000000000003';
const runId = '10000000-0000-4000-8000-000000000001';
const otherRun = '10000000-0000-4000-8000-0000000000ff';
const digest = 'a'.repeat(64);
const run = { scope: 'run', userId, personId, runId, exp: Date.now() + 60_000 };

test('a signed token verifies; forged, altered and expired ones do not', async () => {
  const token = await signEdgeToken(run, secret);
  assert.deepEqual(await verifyEdgeToken(token, secret), run);
  assert.equal(await verifyEdgeToken(token, 'other-secret'), null);
  const [payload, signature] = token.split('.');
  const widened = Buffer.from(JSON.stringify({ ...run, scope: 'server' })).toString('base64url');
  assert.equal(await verifyEdgeToken(`${widened}.${signature}`, secret), null);
  assert.equal(await verifyEdgeToken(`${payload}.${signature}.x`, secret), null);
  assert.equal(await verifyEdgeToken(await signEdgeToken({ ...run, exp: Date.now() - 1 }, secret), secret), null);
  assert.equal(await verifyEdgeToken(await signEdgeToken({ ...run, scope: 'root' }, secret), secret), null);
  assert.equal(await verifyEdgeToken(undefined, secret), null);
});

test('a run writes only its own archives and its person blobs, bound to the digest in the key', () => {
  assert.deepEqual(authorizeObject(run, 'PUT', `${userId}/${personId}/${runId}/${digest}.json`), { allowed: true, digest });
  assert.deepEqual(authorizeObject(run, 'PUT', `${userId}/${personId}/blobs/${digest}`), { allowed: true, digest });
  assert.equal(authorizeObject(run, 'PUT', `${userId}/${personId}/${otherRun}/${digest}.json`).allowed, false);
  assert.equal(authorizeObject(run, 'PUT', `${userId}/${personId}/${runId}/notes.txt`).allowed, false);
  assert.equal(authorizeObject(run, 'PUT', `${userId}/${personId}/${runId}/../${digest}.json`).allowed, false);
  assert.equal(authorizeObject(run, 'DELETE', `${userId}/${personId}/${runId}/${digest}.json`).allowed, false);
});

test('a run reads any archive or blob of its own person and nothing of another', () => {
  assert.equal(authorizeObject(run, 'GET', `${userId}/${personId}/${otherRun}/${digest}.json`).allowed, true);
  assert.equal(authorizeObject(run, 'GET', `${userId}/${personId}/blobs/${digest}`).allowed, true);
  assert.equal(authorizeObject(run, 'GET', `${userId}/${runId}/blobs/${digest}`).allowed, false);
  assert.equal(authorizeObject(run, 'GET', `${personId}/${personId}/blobs/${digest}`).allowed, false);
  assert.equal(authorizeObject({ scope: 'watch', runId, exp: 1 }, 'GET', `${userId}/${personId}/blobs/${digest}`).allowed, false);
  assert.equal(authorizeObject(null, 'GET', `${userId}/${personId}/blobs/${digest}`).allowed, false);
});

test('the server may use any key, and content-addressed keys still carry their digest', () => {
  const server = { scope: 'server', exp: 1 };
  assert.deepEqual(authorizeObject(server, 'PUT', `${userId}/${personId}/imports/item.json`), { allowed: true, digest: null });
  assert.deepEqual(authorizeObject(server, 'PUT', `${userId}/${personId}/blobs/${digest}`), { allowed: true, digest });
});
