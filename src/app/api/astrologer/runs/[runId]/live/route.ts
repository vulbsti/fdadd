/**
 * Where the owner's browser can read a run's live text directly from the
 * edge stream, with a short-lived capability for that one run. Returns 404
 * when no edge is configured; the events route then carries the text.
 */

import { NextResponse } from 'next/server';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { AgentStoreError } from '@/lib/astro/agent-store';
import { edgeConfig, signEdgeWatchToken } from '@/lib/edge/client';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const { runId } = await params;
  try {
    const run = await auth.store.getRun(runId);
    if (run.user_id !== auth.userId) throw new AgentStoreError('forbidden', 'not your run');
    const edge = edgeConfig();
    if (!edge) return NextResponse.json({ code: 'not_found', message: 'live stream not configured' }, { status: 404 });
    return NextResponse.json({ url: `${edge.origin}/runs/${run.id}/stream`, token: await signEdgeWatchToken(edge, run.id) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
