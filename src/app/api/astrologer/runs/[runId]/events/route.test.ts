import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), storeRun: vi.fn(), workflow: vi.fn(), dispatch: vi.fn(),
}));
vi.mock('workflow/api', () => ({ getRun: mocks.workflow }));
vi.mock('@/lib/astro/run-dispatch', () => ({ dispatchAstrologerRunBestEffort: mocks.dispatch }));
vi.mock('@/lib/astro/api-helpers', () => ({
  requireAuth: mocks.requireAuth,
  unconfigured: () => Response.json({ error: 'unconfigured' }, { status: 503 }),
  errorResponse: () => Response.json({ error: 'failed' }, { status: 500 }),
}));

import { GET } from './route';

const runId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000002';
const context = { params: Promise.resolve({ runId }) };
const request = (signal?: AbortSignal) => new Request(`http://localhost/api/astrologer/runs/${runId}/events?after=4`, { signal });

function fixture(chunks: unknown[] = [], close = false, cancelAcknowledged = true) {
  const upstreamCancel = vi.fn(() => cancelAcknowledged ? Promise.resolve() : new Promise<void>(() => {}));
  const source = new ReadableStream({
    start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); if (close) controller.close(); },
    cancel: upstreamCancel,
  });
  const reader = source.getReader();
  const cancel = vi.spyOn(reader, 'cancel');
  const release = vi.spyOn(reader, 'releaseLock');
  const status = vi.fn(() => Promise.resolve('running'));
  const getReadable = vi.fn(() => ({ getReader: () => reader }));
  mocks.workflow.mockReturnValue({ exists: Promise.resolve(true), getReadable, get status() { return status(); } });
  return { cancel, release, status, getReadable, upstreamCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  mocks.storeRun.mockResolvedValue({ id: runId, user_id: userId, workflow_run_id: 'workflow-one', status: 'active' });
  mocks.requireAuth.mockResolvedValue({ userId, store: { getRun: mocks.storeRun } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('run SSE reader lifetime', () => {
  it.each(['run.completed', 'run.failed'])(
    'sends %s then closes without waiting for workflow status or upstream cancellation', async (event) => {
      const upstream = fixture([{ type: event, payload: { status: event === 'run.failed' ? 'failed' : 'complete' } }], false, false);
      upstream.status.mockImplementation(() => new Promise(() => {}));
      const response = await GET(request(), context);
      const body = await response.text();
      expect(body).toContain(`id: 5\nevent: ${event}\n`);
      expect(body.match(/\nevent:/g)).toHaveLength(1);
      expect(upstream.getReadable).toHaveBeenCalledWith({ startIndex: 5 });
      expect(upstream.status).not.toHaveBeenCalled();
      expect(upstream.cancel).toHaveBeenCalledTimes(1);
      expect(upstream.release).toHaveBeenCalledTimes(1);
    },
  );

  it('request abort closes the response and releases the reader without synthesizing a terminal event', async () => {
    const upstream = fixture([], false, false);
    const abort = new AbortController();
    const response = await GET(request(abort.signal), context);
    const body = response.text();
    abort.abort();
    expect(await body).toBe('');
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
    expect(upstream.status).not.toHaveBeenCalled();
    expect(mocks.storeRun).toHaveBeenCalledTimes(1);
  });

  it('an already-aborted request does not leave a read or renewal timer behind', async () => {
    vi.useFakeTimers();
    const upstream = fixture();
    const abort = new AbortController();
    abort.abort();
    const response = await GET(request(abort.signal), context);
    expect(await response.text()).toBe('');
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
    expect(upstream.status).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('consumer cancellation followed by request abort is cleaned up exactly once', async () => {
    const upstream = fixture();
    const abort = new AbortController();
    const response = await GET(request(abort.signal), context);
    await response.body!.cancel();
    abort.abort();
    await Promise.resolve();
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
    expect(upstream.status).not.toHaveBeenCalled();
  });

  it('renews at 240 seconds while keeping the durable workflow untouched', async () => {
    vi.useFakeTimers();
    const upstream = fixture();
    const response = await GET(request(), context);
    const body = response.text();
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await body).toBe('');
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
    expect(upstream.status).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renewal interrupts a pending status lookup after natural stream EOF', async () => {
    vi.useFakeTimers();
    const upstream = fixture([], true);
    upstream.status.mockImplementation(() => new Promise(() => {}));
    const response = await GET(request(), context);
    const body = response.text();
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await body).toBe('');
    expect(upstream.status).toHaveBeenCalledTimes(1);
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
  });

  it('natural EOF can still synthesize an authoritative completed event', async () => {
    const upstream = fixture([], true);
    upstream.status.mockResolvedValue('completed');
    mocks.storeRun.mockResolvedValueOnce({ id: runId, user_id: userId, workflow_run_id: 'workflow-one', status: 'active' })
      .mockResolvedValueOnce({ id: runId, user_id: userId, status: 'complete' });
    const response = await GET(request(), context);
    expect(await response.text()).toContain('event: run.completed');
    expect(mocks.storeRun).toHaveBeenCalledTimes(2);
    expect(upstream.release).toHaveBeenCalledTimes(1);
  });

  it('renewal also interrupts a stalled terminal-state database read', async () => {
    vi.useFakeTimers();
    const upstream = fixture([], true);
    upstream.status.mockResolvedValue('completed');
    mocks.storeRun.mockResolvedValueOnce({ id: runId, user_id: userId, workflow_run_id: 'workflow-one', status: 'active' })
      .mockImplementationOnce(() => new Promise(() => {}));
    const response = await GET(request(), context);
    const body = response.text();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.storeRun).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await body).toBe('');
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(upstream.release).toHaveBeenCalledTimes(1);
  });
});
