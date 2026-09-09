import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = safeRedirectPath(
    request.nextUrl.searchParams.get('next'),
    '/profile'
  );
  redirectTo.search = '';

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;

  if (isSupabaseConfigured() && tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const response = NextResponse.redirect(redirectTo);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }

  redirectTo.pathname = '/auth/error';
  redirectTo.searchParams.set('reason', 'email_confirmation_failed');
  const response = NextResponse.redirect(redirectTo);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
