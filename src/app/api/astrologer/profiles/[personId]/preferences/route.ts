import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({ astrologyEnabled: z.boolean(), expectedModeEpoch: z.number().int().nonnegative(), clientCommandId: z.string().uuid() });

export async function PATCH(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request', message: 'Invalid preference change.' }, { status: 400 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const { data: current } = await client.from('person_preferences').select('mode_epoch,domains,locale').eq('profile_id', personId).maybeSingle();
  if (!current) return NextResponse.json({ code: 'not_found', message: 'Person was not found.' }, { status: 404 });
  const { data, error } = await client.rpc('person_set_preferences', {
    p_profile_id: personId,
    p_astrology_enabled: parsed.data.astrologyEnabled,
    p_domains: current.domains ?? {},
    p_locale: current.locale ?? '',
    p_command_id: parsed.data.clientCommandId,
    p_expected_mode_epoch: parsed.data.expectedModeEpoch,
  });
  if (error?.code === 'PST01') {
    return NextResponse.json({ code: 'stale_version', message: 'Settings changed in another tab. Refresh and retry.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ code: 'invalid_request', message: error.message }, { status: 400 });
  return NextResponse.json(data, { headers: { 'cache-control': 'private, no-store' } });
}
