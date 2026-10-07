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

  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return noStoreRedirect(redirectTo);
  }

  redirectTo.pathname = '/auth/error';
  redirectTo.searchParams.set('reason', 'oauth_callback_failed');
  return noStoreRedirect(redirectTo);
}
