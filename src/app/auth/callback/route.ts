import { NextResponse, type NextRequest } from 'next/server';
import { APP_HOME } from '@/lib/app-url';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = safeRedirectPath(
    request.nextUrl.searchParams.get('next'),
    APP_HOME
  );
  redirectTo.search = '';

  if (!isSupabaseConfigured()) {
    redirectTo.pathname = '/auth/error';
    redirectTo.searchParams.set('reason', 'not_configured');
    return noStoreRedirect(redirectTo);
  }

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return noStoreRedirect(redirectTo);
    console.error('[auth/callback] code exchange failed', { code: error.code, status: error.status, message: error.message });
  } else {
    // Supabase sends its own failure back as ?error=…&error_description=…
    console.error('[auth/callback] no code', { error: params.get('error'), code: params.get('error_code'), description: params.get('error_description') });
  }

  redirectTo.pathname = '/auth/error';
  redirectTo.searchParams.set('reason', 'oauth_callback_failed');
  return noStoreRedirect(redirectTo);
}
