import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/request-auth';
import { readObjectProjection } from '@/lib/astro/person-read-model';

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string; objectId: string }> }) {
  const { personId, objectId } = await params;
  const authed = await getRequestUser();
  if (!authed) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const { client, user } = authed;
  const projection = await readObjectProjection(client, personId, objectId).catch(() => null);
  if (!projection) return NextResponse.json({ code: 'not_found', message: 'Profile object was not found.' }, { status: 404 });
  return NextResponse.json(projection, { headers: { 'cache-control': 'private, no-store' } });
}
