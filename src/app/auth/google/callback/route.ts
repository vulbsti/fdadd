import { NextResponse, type NextRequest } from 'next/server';
import {
  decodeFlowCookie,
  exchangeCodeForIdToken,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  googleSignInConfig,
} from '@/lib/auth/google-signin';
import { createClient } from '@/lib/supabase/server';

function redirect(request: NextRequest, path: string, reason?: string) {
  const url = new URL(path, request.nextUrl.origin);
  if (reason) url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  response.cookies.set(GOOGLE_STATE_COOKIE, '', { path: GOOGLE_CALLBACK_PATH, maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const config = googleSignInConfig();
  const flow = decodeFlowCookie(request.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!config || !flow || !code || !state || state !== flow.state) {
    console.error('[auth/google/callback] bad callback', {
      configured: Boolean(config),
      hasFlowCookie: Boolean(flow),
      hasCode: Boolean(code),
      stateMatches: Boolean(flow && state === flow.state),
      googleError: request.nextUrl.searchParams.get('error'),
    });
    return redirect(request, '/auth/error', 'oauth_callback_failed');
  }

  const redirectUri = new URL(GOOGLE_CALLBACK_PATH, request.nextUrl.origin).toString();
  const idToken = await exchangeCodeForIdToken(config, code, redirectUri);
  if (!idToken) {
    console.error('[auth/google/callback] Google token exchange returned no id_token');
    return redirect(request, '/auth/error', 'oauth_callback_failed');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: flow.nonce });
  if (error) {
    console.error('[auth/google/callback] signInWithIdToken failed', { code: error.code, status: error.status, message: error.message });
    return redirect(request, '/auth/error', 'oauth_callback_failed');
  }

  return redirect(request, flow.next);
}
