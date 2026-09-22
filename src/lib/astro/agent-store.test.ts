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
