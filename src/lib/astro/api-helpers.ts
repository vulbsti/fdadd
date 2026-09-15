import { NextResponse } from 'next/server';
import { start, getRun } from 'workflow/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AgentStore, AgentStoreError } from '@/lib/astro/agent-store';
import type { ApiErrorDto } from '@/lib/astro/contracts';

export function unconfigured(): NextResponse {
  return NextResponse.json(
    { code: 'unconfigured', message: 'Astrologer is not configured.' } satisfies ApiErrorDto,
    { status: 503 },
  );
}

export function errorResponse(error: unknown, fallbackStatus = 500): NextResponse {
  if (error instanceof AgentStoreError) {
    const status =
      error.code === 'not_found' ? 404
      : error.code === 'forbidden' ? 403
      : error.code === 'conflict' ? 409
      : error.code === 'stale_version' ? 409
      : error.code === 'invalid_transition' ? 422
      : error.code === 'quota_exceeded' ? 429
      : error.code === 'invalid_request' ? 400
      : error.code === 'unconfigured' ? 503
      : fallbackStatus;
    return NextResponse.json(error.toDto(), { status });
  }
  const message = error instanceof Error ? error.message : 'internal error';
  return NextResponse.json(
    { code: 'internal', message } satisfies ApiErrorDto,
    { status: fallbackStatus },
  );
}

export interface AuthedContext {
  userId: string;
  store: AgentStore;
}

/** Authenticate the request and build the agent store with both clients. */
export async function requireAuth(): Promise<AuthedContext | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, store: new AgentStore(supabase, createAdminClient()) };
}

/**
 * Start a workflow for a run and CAS-attach its ID. When another request
 * already won, the loser cancels its duplicate and returns the winning ID.
 */
export async function startAndAttach(
  workflow: (runId: string) => Promise<unknown>,
  runId: string,
  store: AgentStore,
): Promise<{ workflowRunId: string; won: boolean }> {
  const run = await start(workflow, [runId]);
  const attach = await store.attachWorkflowRun(runId, run.runId);
  if (!attach.won) {
    await getRun(run.runId).cancel().catch(() => undefined);
  }
  return { workflowRunId: attach.workflowRunId, won: attach.won };
}
