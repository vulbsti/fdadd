import { NextResponse, type NextRequest } from 'next/server';
import { APP_HOME } from '@/lib/app-url';
import {
  encodeFlowCookie,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  googleAuthorizeUrl,
  googleSignInConfig,
  newFlowState,
} from '@/lib/auth/google-signin';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

function errorRedirect(request: NextRequest, reason: string) {
  const url = new URL('/auth/error', request.nextUrl.origin);
  url.searchParams.set('reason', reason);
  return noStore(NextResponse.redirect(url));
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return errorRedirect(request, 'not_configured');
  const next = safeRedirectPath(request.nextUrl.searchParams.get('next'), APP_HOME);
  const config = googleSignInConfig();

  if (!config) {
    // Not set up yet: fall back to Supabase's hosted flow (returns via *.supabase.co).
    const supabase = await createClient();
    const redirectTo = new URL('/auth/callback', request.nextUrl.origin);
    redirectTo.searchParams.set('next', next);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) return errorRedirect(request, 'oauth_start_failed');
    return noStore(NextResponse.redirect(data.url));
  }

  const flow = newFlowState(next);
  const redirectUri = new URL(GOOGLE_CALLBACK_PATH, request.nextUrl.origin).toString();
  const response = noStore(NextResponse.redirect(googleAuthorizeUrl(config, redirectUri, flow)));
  response.cookies.set(GOOGLE_STATE_COOKIE, encodeFlowCookie(flow), {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: GOOGLE_CALLBACK_PATH,
    maxAge: 600,
  });
  return response;
}
