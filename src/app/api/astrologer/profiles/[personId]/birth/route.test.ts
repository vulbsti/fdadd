import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStoreError } from '@/lib/astro/agent-store';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  beginBirthSetup: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('@/lib/astro/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/astro/api-helpers')>();
  return { ...actual, requireAuth: mocks.requireAuth };
});
vi.mock('@/lib/astro/run-dispatch', () => ({
  dispatchAstrologerRunBestEffort: mocks.dispatch,
}));

import { POST } from './route';

const personId = 'a2000000-0000-4000-8000-000000000011';
const clientRequestId = 'a2000000-0000-4000-8000-000000000050';
const runId = 'a2000000-0000-4000-8000-000000000060';
const birth = {
  date: '1991-04-12',
  time: '06:35',
  latitude: 12.97,
  longitude: 77.59,
  timezone: 'Asia/Kolkata',
  place_name: 'Bengaluru, Karnataka, India',
  time_source: 'family',
  time_confidence: 'approximate',
};

function request(body: unknown): Request {
  return new Request(`http://localhost/api/astrologer/profiles/${personId}/birth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ personId }) };
}

describe('existing-person birth setup POST', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      userId: 'a2000000-0000-4000-8000-000000000001',
      store: { beginExistingProfileBirthSetup: mocks.beginBirthSetup },
    });
    mocks.beginBirthSetup.mockResolvedValue({
      profileId: personId,
      sessionId: 'a2000000-0000-4000-8000-000000000061',
      runId,
      birthRevision: 3,
      status: 'active',
      replayed: false,
    });
    // Dispatch is best effort: the transactional acceptance remains valid
    // while the durable outbox/sweeper recovers a transient start failure.
    mocks.dispatch.mockResolvedValue(null);
  });

  it('accepts and replays birth setup even when best-effort dispatch returns null', async () => {
    const payload = { clientRequestId, birth };
    const accepted = await POST(request(payload), context());

    expect(accepted.status).toBe(202);
    expect(accepted.headers.get('cache-control')).toBe('private, no-store');
    expect((await accepted.json()).runId).toBe(runId);
    expect(mocks.beginBirthSetup).toHaveBeenNthCalledWith(1, personId, birth, clientRequestId);
    expect(mocks.dispatch).toHaveBeenNthCalledWith(1, runId);

    mocks.beginBirthSetup.mockResolvedValueOnce({
      profileId: personId,
      sessionId: 'a2000000-0000-4000-8000-000000000061',
      runId,
      birthRevision: 3,
      status: 'active',
      replayed: true,
    });
    const replay = await POST(request(payload), context());

    expect(replay.status).toBe(200);
    expect((await replay.json()).replayed).toBe(true);
    expect(mocks.beginBirthSetup).toHaveBeenNthCalledWith(2, personId, birth, clientRequestId);
    expect(mocks.dispatch).toHaveBeenNthCalledWith(2, runId);
  });

  it('returns 403 when the authenticated owner check rejects this person', async () => {
    mocks.beginBirthSetup.mockRejectedValue(new AgentStoreError('forbidden', 'You do not own this person.'));

    const response = await POST(request({ clientRequestId, birth }), context());

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('forbidden');
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed birth data without mutating or dispatching', async () => {
    const response = await POST(request({
      clientRequestId,
      birth: { ...birth, time: '8:00' },
    }), context());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_request');
    expect(mocks.beginBirthSetup).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
