import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  objectId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  clientCommandId: z.string().uuid(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const { personId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'invalid_request', message: 'Invalid exploration request.' },
      { status: 400 },
    );
  }
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  const { data, error } = await client.rpc('person_start_exploration', {
    p_profile_id: personId,
    p_object_id: parsed.data.objectId,
    p_expected_revision: parsed.data.expectedRevision,
    p_command_id: parsed.data.clientCommandId,
  });
  if (error) {
    const status = error.code === 'PST01' ? 409 : error.code === 'ANF01' ? 404 : 400;
    return NextResponse.json(
      {
        code: status === 409 ? 'stale_version' : status === 404 ? 'not_found' : 'invalid_request',
        message: error.message,
      },
      { status },
    );
  }
  return NextResponse.json(data, {
    status: data?.replayed ? 200 : 201,
    headers: { 'cache-control': 'private, no-store' },
  });
}
