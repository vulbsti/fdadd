import { describe, expect, it, vi } from 'vitest';

vi.mock('workflow/api', () => ({ start: vi.fn(), getRun: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { errorResponse } from './api-helpers';
import { AgentStoreError } from './agent-store';

describe('safe API failure classification', () => {
  it.each(['PGRST202', 'PGRST205', '42P01', '42883', '42703'])('classifies schema drift %s as unavailable', async (code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = errorResponse({ code, message: 'private database detail', details: 'private row' });
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe('unconfigured');
      expect(JSON.stringify(body)).not.toContain('private');
      expect(log).toHaveBeenCalledWith('[astrologer-api] database request failed', { databaseCode: code });
    } finally {
      log.mockRestore();
    }
  });

  it('does not change typed conflict errors', async () => {
    const response = errorResponse(new AgentStoreError('conflict', 'An active run already exists.'));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('conflict');
  });
});
