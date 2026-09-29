import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { connectGoogle, googleRedirectUri } from '@/lib/connectors/google';
import { requireOwnedPerson } from '@/lib/imports/http';

export const runtime = 'nodejs';
const GOOGLE_STATE_COOKIE = 'aidoraa_google_oauth';

function sameState(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stored = (await cookies()).get(GOOGLE_STATE_COOKIE)?.value ?? '';
  const [state, personId] = stored.split('.');
  const back = (outcome: string) => {
    const target = personId ? `/astrologer/p/${personId}/imports?google=${outcome}` : '/astrologer';
    const response = NextResponse.redirect(new URL(target, request.url));
    response.cookies.set(GOOGLE_STATE_COOKIE, '', { maxAge: 0, path: '/api/connectors/google' });
    return response;
  };
  if (!state || !personId || !sameState(state, url.searchParams.get('state') ?? '')) return back('failed');
  if (url.searchParams.get('error')) return back('cancelled');
  const code = url.searchParams.get('code');
  if (!code) return back('failed');
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return back('failed');
  try {
    await connectGoogle(owned.admin, owned.scope.userId, code, googleRedirectUri(request.url));
    return back('connected');
  } catch (error) {
    console.error('[google] connection failed', { message: error instanceof Error ? error.message : 'unknown' });
    return back('failed');
  }
}
