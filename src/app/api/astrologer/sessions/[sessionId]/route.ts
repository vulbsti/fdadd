/** Session detail: persisted messages, latest run, opaque keyset cursor. */

import { NextResponse } from 'next/server';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { AgentStoreError } from '@/lib/astro/agent-store';
import {
  AstrologerSessionDetailSchema,
  type AstrologerSessionDetail,
} from '@/lib/astro/contracts';

export const runtime = 'nodejs';

function encodeCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  const { sessionId } = await params;
  const cursor = decodeCursor(new URL(request.url).searchParams.get('cursor'));

  try {
    const session = await auth.store.getSession(sessionId);
    if (!session || session.user_id !== auth.userId) {
      throw new AgentStoreError('not_found', 'session not found');
    }
    const profileId = session.profile_id as string | null;
    const profile = profileId ? await auth.store.getProfile(profileId) : null;
    const { messages, nextCursor } = await auth.store.listMessages(sessionId, cursor);
    const latestRun = session.last_run_id
      ? await auth.store.getRun(session.last_run_id as string).catch(() => null)
      : null;

    const profileName = (profile?.name as string | null) ?? null;
    const detail: AstrologerSessionDetail = AstrologerSessionDetailSchema.parse({
      session: {
        id: session.id,
        profileId,
        profileName,
        title: session.title ?? 'New reading',
        status: session.status ?? 'complete',
        currentQuestion: session.current_question ?? null,
        nextAction: session.next_action ?? null,
        lastMessagePreview: session.last_message_preview ?? null,
        latestRun: null,
        updatedAt: session.updated_at,
      },
      profile:
        profile == null
          ? null
          : {
              id: profile.id as string,
              name: profile.name as string,
              initializationStatus: profile.initialization_status as 'pending' | 'ready' | 'failed',
              initializationError: (profile.initialization_error as string | null) ?? null,
              hasChart: profile.chart_json != null,
              createdAt: profile.created_at as string,
            },
      messages,
      latestRun:
        latestRun == null
          ? null
          : {
              id: latestRun.id,
              kind: latestRun.kind,
              status: latestRun.status,
              phase: latestRun.phase,
              nextAction: latestRun.next_action,
              resumable: latestRun.resumable,
              resumeFromRunId: latestRun.resume_from_run_id,
              createdAt: latestRun.started_at,
              updatedAt: latestRun.updated_at,
            },
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    });
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
