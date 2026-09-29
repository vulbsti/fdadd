import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { googleAuthorizeUrl, googleConfig, googleRedirectUri } from '@/lib/connectors/google';
import { requireOwnedPerson } from '@/lib/imports/http';

export const runtime = 'nodejs';
const GOOGLE_STATE_COOKIE = 'aidoraa_google_oauth';

/** Send the person to Google's consent screen; they come back to the imports page. */
export async function GET(request: Request) {
  const personId = new URL(request.url).searchParams.get('personId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return NextResponse.json({ code: 'invalid_request', message: 'Missing person.' }, { status: 400 });
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return owned;
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL(`/astrologer/p/${personId}/imports?google=unavailable`, request.url));
  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(googleAuthorizeUrl(config.clientId, googleRedirectUri(request.url), state));
  response.cookies.set(GOOGLE_STATE_COOKIE, `${state}.${personId}`, {
    httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', maxAge: 600, path: '/api/connectors/google',
  });
  return response;
}
