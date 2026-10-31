import { NextResponse, type NextRequest } from 'next/server';
import {
  addTester,
  BETA_CALLBACK_PATH,
  BETA_STATE_COOKIE,
  betaSignupConfig,
  verifiedEmailFromCode,
} from '@/lib/beta/testers';

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/beta', request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  response.cookies.set(BETA_STATE_COOKIE, '', { path: BETA_CALLBACK_PATH, maxAge: 0 });
  return response;
}

/** Google sends the visitor back here; add their account to the testers group. */
export async function GET(request: NextRequest) {
  const config = betaSignupConfig();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expected = request.cookies.get(BETA_STATE_COOKIE)?.value;

  if (request.nextUrl.searchParams.get('error') === 'access_denied') return back(request, { error: 'cancelled' });
  if (!config || !code || !state || !expected || state !== expected) {
    console.error('[beta/callback] bad callback', {
      configured: Boolean(config), hasCode: Boolean(code), stateMatches: Boolean(expected && state === expected),
      googleError: request.nextUrl.searchParams.get('error'),
    });
    return back(request, { error: 'signin' });
  }

  const redirectUri = new URL(BETA_CALLBACK_PATH, request.nextUrl.origin).toString();
  const email = await verifiedEmailFromCode(config.oauth, code, redirectUri);
  if (!email) {
    console.error('[beta/callback] no verified email from Google');
    return back(request, { error: 'signin' });
  }

  try {
    const result = await addTester(config, email);
    console.info('[beta/callback] tester', result);
    return back(request, { joined: email });
  } catch (error) {
    console.error('[beta/callback] add to testers group failed', error instanceof Error ? error.message : error);
    return back(request, { error: 'group' });
  }
}
