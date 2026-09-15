/**
 * Explicit resume for a failed, resumable run. The failed run stays
 * immutable; resume creates a new run linked to it and starts a fresh
 * Workflow — it never retries the old Workflow ID.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, startAndAttach, unconfigured } from '@/lib/astro/api-helpers';
import { astrologerRunWorkflow } from '@/workflows/astrologer-run';

export const runtime = 'nodejs';

const resumeSchema = z.object({
  clientRequestId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  const { runId } = await params;

  const parsed = resumeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'invalid_request', message: 'Invalid resume request.' },
      { status: 400 },
    );
  }

  try {
    const resumed = await auth.store.resumeAgentRun(runId, parsed.data.clientRequestId);
    if (!resumed.replayed) {
      await startAndAttach(astrologerRunWorkflow, resumed.runId, auth.store);
    }
    return NextResponse.json(
      {
        runId: resumed.runId,
        messageId: resumed.messageId,
        status: resumed.status,
        eventsUrl: `/api/astrologer/runs/${resumed.runId}/events`,
        replayed: resumed.replayed,
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
