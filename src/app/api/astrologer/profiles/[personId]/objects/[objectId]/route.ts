import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string; objectId: string }> }) {
  const { personId, objectId } = await params;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const projection = await readObjectProjection(client, personId, objectId).catch(() => null);
  if (!projection) return NextResponse.json({ code: 'not_found', message: 'Profile object was not found.' }, { status: 404 });
  return NextResponse.json(projection, { headers: { 'cache-control': 'private, no-store' } });
}
