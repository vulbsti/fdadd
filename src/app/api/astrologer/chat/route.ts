/**
 * Durable chat: idempotent run start via `begin_astro_agent_run`, Workflow
 * start + CAS-attach, immediate 202. No synchronous model loop, no
 * read-modify-upsert quota handling.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, startAndAttach, unconfigured } from '@/lib/astro/api-helpers';
import { astrologerRunWorkflow } from '@/workflows/astrologer-run';

export const runtime = 'nodejs';

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  clientMessageId: z.string().uuid(),
  answerToQuestionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }

  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'invalid_request', message: 'Invalid chat request.' },
      { status: 400 },
    );
  }

  try {
    const begun = await auth.store.beginAgentRun({
      sessionId: parsed.data.sessionId,
      message: parsed.data.message,
      clientMessageId: parsed.data.clientMessageId,
      answerToQuestionId: parsed.data.answerToQuestionId ?? null,
    });

    let replayed = begun.replayed;
    if (!replayed) {
      const run = await auth.store.getRun(begun.runId);
      if (!run.workflow_run_id) {
        await startAndAttach(astrologerRunWorkflow, begun.runId, auth.store);
      } else {
        replayed = true;
      }
    }

    return NextResponse.json(
      {
        runId: begun.runId,
        messageId: begun.messageId,
        status: begun.status,
        eventsUrl: `/api/astrologer/runs/${begun.runId}/events`,
        replayed,
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
