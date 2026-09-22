import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readPersonProjection } from '@/lib/astro/person-read-model';

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  let projection;
  try {
    projection = await readPersonProjection(client, personId, 'life-map');
  } catch {
    return NextResponse.json({ code: 'not_found', message: 'Person was not found.' }, { status: 404 });
  }
  const [{ data: profile }, { data: revision }] = await Promise.all([
    client.from('astro_profiles').select('id,name,person_status,astro_status').eq('id', personId).maybeSingle(),
    client.from('person_model_revisions').select('revision_no,brief,published_at')
      .eq('profile_id', personId).eq('revision_no', projection.personRevision).maybeSingle(),
  ]);
  if (!profile || !revision) return NextResponse.json({ code: 'not_found', message: 'Person was not found.' }, { status: 404 });
  return NextResponse.json({
    personId, name: profile.name, personStatus: profile.person_status, astrologyStatus: profile.astro_status,
    personRevision: projection.personRevision, sourceWatermark: projection.sourceWatermark,
    privacyEpoch: projection.privacyEpoch, mode: projection.mode,
    modeEpoch: projection.modeEpoch, updateState: projection.updateState,
    brief: revision.brief ?? '', generatedAt: revision.published_at ?? projection.generatedAt,
  }, { headers: { 'cache-control': 'private, no-store' } });
}
