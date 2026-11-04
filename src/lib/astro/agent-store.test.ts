import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AgentStore } from './agent-store';

describe('AgentStore database errors', () => {
  it('rewords an unfinished profile setup for people', async () => {
    const userRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'AIT01', message: 'profile initialization is not complete' },
    });
    const store = new AgentStore(
      { rpc: userRpc } as unknown as SupabaseClient,
      { rpc: vi.fn() } as unknown as SupabaseClient,
    );

    await expect(store.createSession('profile-1')).rejects.toMatchObject({
      code: 'invalid_transition',
      message: 'Aidoraa is still getting to know this person. Please try again in a minute.',
    });
  });
});

describe('AgentStore busy profile', () => {
  it('says the last answer is still running instead of the database text', async () => {
    const userRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'ACF01', message: 'another run is active for this profile' },
    });
    const store = new AgentStore(
      { rpc: userRpc } as unknown as SupabaseClient,
      { rpc: vi.fn() } as unknown as SupabaseClient,
    );

    await expect(store.createSession('profile-1')).rejects.toMatchObject({
      code: 'conflict',
      message: 'Aidoraa is still answering your last question. Please wait for it to finish.',
    });
  });
});
