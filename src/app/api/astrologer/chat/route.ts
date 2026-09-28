/**
 * Durable chat: idempotent run start via `begin_astro_agent_run`, Workflow
 * start + CAS-attach, immediate 202. No synchronous model loop, no
 * read-modify-upsert quota handling.
 */

import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { dispatchAstrologerRunBestEffort, sweepAstrologerDispatchesBestEffort } from '@/lib/astro/run-dispatch';
import { dispatchPersonJobBestEffort } from '@/lib/person-model/consolidation-dispatch';
import { reflectOtherSessionsBestEffort } from '@/lib/astro/reflection-dispatch';

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
    // Answering and learning are independent durable workflows. The message,
    // person source, jobs, and both outbox rows have already committed, so a
    // provider or dispatch failure on either side cannot roll back the input.
    after(async () => {
      await Promise.all([
        dispatchAstrologerRunBestEffort(begun.runId),
        dispatchPersonJobBestEffort(),
        // Writing here ends the person's other conversations: reflect on them.
        auth.store.getSession(parsed.data.sessionId).then((session) => typeof session?.profile_id === 'string'
          ? reflectOtherSessionsBestEffort({ profileId: session.profile_id, currentSessionId: parsed.data.sessionId }) : 0).catch(() => 0),
      ]);
      // The scheduled sweeper runs daily on this plan; each accepted message
      // also recovers a few other runs whose dispatch is overdue.
      await sweepAstrologerDispatchesBestEffort(3);
    });

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
