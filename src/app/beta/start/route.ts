import { NextResponse, type NextRequest } from 'next/server';
import { BETA_CALLBACK_PATH, BETA_STATE_COOKIE, betaAuthorizeUrl, betaSignupConfig, newBetaState } from '@/lib/beta/testers';

/** "Become a tester": sign in with Google so we know which account to add. */
export async function GET(request: NextRequest) {
  const config = betaSignupConfig();
  if (!config) {
    const url = new URL('/beta', request.nextUrl.origin);
    url.searchParams.set('error', 'not_ready');
    return NextResponse.redirect(url);
  }
  const state = newBetaState();
  const redirectUri = new URL(BETA_CALLBACK_PATH, request.nextUrl.origin).toString();
  const response = NextResponse.redirect(betaAuthorizeUrl(config.oauth, redirectUri, state));
  response.headers.set('Cache-Control', 'private, no-store');
  response.cookies.set(BETA_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: BETA_CALLBACK_PATH,
    maxAge: 600,
  });
  return response;
}
