import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { AgentStoreError } from '@/lib/astro/agent-store';
import { BirthInputSchema } from '@/lib/astro/contracts';
import { dispatchAstrologerRunBestEffort } from '@/lib/astro/run-dispatch';

export const runtime = 'nodejs';

const BirthSetupInputSchema = BirthInputSchema.omit({ name: true });
const postSchema = z.object({
  clientRequestId: z.string().uuid(),
  birth: BirthSetupInputSchema,
});

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const { personId } = await params;
  try {
    const { data, error } = await auth.store.adminClient
      .from('astro_profiles')
      .select('id,name,astro_status,initialization_status,initialization_error,birth_revision,birth_date,birth_time,lat,lng,tz,place_name,time_source,time_confidence')
      .eq('id', personId)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AgentStoreError('not_found', 'Person was not found.');
    if (data.astro_status === 'pending') {
      const { data: pendingRun, error: runError } = await auth.store.adminClient
        .from('astro_agent_runs')
        .select('id')
        .eq('profile_id', personId)
        .eq('user_id', auth.userId)
        .eq('kind', 'intake')
        .eq('status', 'active')
        .is('workflow_run_id', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runError) throw runError;
      if (pendingRun) await dispatchAstrologerRunBestEffort(pendingRun.id as string);
    }
    return NextResponse.json({
      profileId: data.id,
      status: data.astro_status,
      initializationStatus: data.initialization_status,
      error: data.initialization_error,
      birthRevision: Number(data.birth_revision ?? 0),
      birth: data.birth_date && data.birth_time && data.lat !== null && data.lng !== null && data.tz
        ? {
            date: data.birth_date,
            time: data.birth_time,
            latitude: data.lat,
            longitude: data.lng,
            timezone: data.tz,
            place_name: data.place_name,
            time_source: data.time_source,
            time_confidence: data.time_confidence,
          }
        : null,
    }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const { personId } = await params;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: 'invalid_request', message: 'Enter a date, time, and selected birth place.' }, { status: 400 });
  }

  try {
    const setup = await auth.store.beginExistingProfileBirthSetup(
      personId,
      parsed.data.birth,
      parsed.data.clientRequestId,
    );
    // Acceptance and the outbox are already committed together. A transient
    // dispatcher failure must not turn saved birth details into an HTTP error;
    // replay, polling, or the safety sweep will recover the same run.
    await dispatchAstrologerRunBestEffort(setup.runId);
    return NextResponse.json({
      profileId: setup.profileId,
      sessionId: setup.sessionId,
      runId: setup.runId,
      birthRevision: setup.birthRevision,
      status: setup.status,
      eventsUrl: `/api/astrologer/runs/${setup.runId}/events`,
      replayed: setup.replayed,
    }, { status: setup.replayed ? 200 : 202, headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AgentStoreError && error.code === 'conflict') return errorResponse(error, 409);
    return errorResponse(error);
  }
}
