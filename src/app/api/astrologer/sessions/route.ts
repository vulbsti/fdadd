/**
 * Astrologer sessions: durable run starts instead of synchronous chat.
 *
 * POST is a discriminated union:
 *  - {mode:'new_profile', clientRequestId, birth} → intake RPC + intake workflow, 202.
 *  - {mode:'existing_profile', profileId} → create_astro_session, 201 (no recalc).
 * GET returns camelCase session summaries ordered by server activity.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { AgentStoreError } from '@/lib/astro/agent-store';
import {
  AstrologerSessionSummarySchema,
  BirthInputSchema,
  type AstrologerSessionSummary,
} from '@/lib/astro/contracts';
import { dispatchAstrologerRunBestEffort } from '@/lib/astro/run-dispatch';

export const runtime = 'nodejs';

const postSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('new_profile'),
    clientRequestId: z.string().uuid(),
    birth: BirthInputSchema,
  }),
  z.object({
    mode: z.literal('existing_profile'),
    profileId: z.string().uuid(),
  }),
]);

function toSummary(row: Record<string, unknown>): AstrologerSessionSummary {
  const profile = (row.profile ?? null) as { name?: string } | null;
  return AstrologerSessionSummarySchema.parse({
    id: row.id,
    profileId: row.profile_id ?? null,
    profileName: profile?.name ?? null,
    title: row.title ?? 'New reading',
    status: row.status ?? 'complete',
    currentQuestion: row.current_question ?? null,
    nextAction: row.next_action ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    latestRun: null,
    updatedAt: row.updated_at,
  });
}

/** List the caller's astrologer sessions, newest server activity first. */
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  try {
    const rows = await auth.store.listSessions(auth.userId);
    const sessions = rows.map(toSummary);
    return NextResponse.json({ sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'invalid_request', message: 'Invalid session request.' },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.mode === 'new_profile') {
      const intake = await auth.store.beginProfileIntake(
        parsed.data.birth,
        parsed.data.clientRequestId,
      );
      await dispatchAstrologerRunBestEffort(intake.runId);
      return NextResponse.json(
        {
          sessionId: intake.sessionId,
          profileId: intake.profileId,
          runId: intake.runId,
          status: intake.status,
          eventsUrl: `/api/astrologer/runs/${intake.runId}/events`,
          replayed: intake.replayed,
        },
        { status: 202 },
      );
    }

    const created = await auth.store.createSession(parsed.data.profileId);
    return NextResponse.json(
      { sessionId: created.sessionId, profileId: created.profileId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AgentStoreError && error.code === 'conflict') {
      return errorResponse(error, 409);
    }
    return errorResponse(error);
  }
}
