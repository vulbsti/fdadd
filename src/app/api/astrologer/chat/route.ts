/**
 * Durable chat: idempotent run start via `begin_astro_agent_run`, Workflow
 * start + CAS-attach, immediate 202. No synchronous model loop, no
 * read-modify-upsert quota handling.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { dispatchAstrologerRunBestEffort } from '@/lib/astro/run-dispatch';

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

    // Always attempt dispatch, including an idempotent request replay. A retry
    // can therefore recover a process crash that happened after the database
    // committed the run but before Workflow was started.
    await dispatchAstrologerRunBestEffort(begun.runId);

    return NextResponse.json(
      {
        runId: begun.runId,
        messageId: begun.messageId,
        status: begun.status,
        eventsUrl: `/api/astrologer/runs/${begun.runId}/events`,
        replayed: begun.replayed,
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
