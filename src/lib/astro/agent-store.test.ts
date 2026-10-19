import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AgentStore } from './agent-store';

describe('AgentStore workflow attachment authority', () => {
  it('uses the service-role client for server-only workflow attachment', async () => {
    const userRpc = vi.fn();
    const adminRpc = vi.fn().mockResolvedValue({
      data: { workflowRunId: 'workflow-1', won: true },
      error: null,
    });
    const store = new AgentStore(
      { rpc: userRpc } as unknown as SupabaseClient,
      { rpc: adminRpc } as unknown as SupabaseClient,
    );

    await expect(store.attachWorkflowRun('run-1', 'workflow-1')).resolves.toEqual({
      workflowRunId: 'workflow-1',
      won: true,
    });
    expect(userRpc).not.toHaveBeenCalled();
    expect(adminRpc).toHaveBeenCalledWith('attach_astro_workflow_run', {
      p_run_id: 'run-1',
      p_workflow_run_id: 'workflow-1',
    });
  });
});

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
