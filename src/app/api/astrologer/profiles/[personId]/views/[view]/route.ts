import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/request-auth';
import { readPersonProjection } from '@/lib/astro/person-read-model';

const views = new Set(['life-map', 'patterns', 'people', 'paths']);

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string; view: string }> }) {
  const { personId, view } = await params;
  if (!views.has(view)) return NextResponse.json({ code: 'not_found', message: 'Unknown view.' }, { status: 404 });
  try {
    const authed = await getRequestUser();
    if (!authed) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
    const { client, user } = authed;
    const projection = await readPersonProjection(client, personId, view as 'life-map' | 'patterns' | 'people' | 'paths');
    return NextResponse.json(projection, { headers: { 'cache-control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ code: 'not_found', message: 'Person view was not found.' }, { status: 404 });
  }
}
