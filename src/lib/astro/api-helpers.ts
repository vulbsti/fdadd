import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AgentStore, AgentStoreError } from '@/lib/astro/agent-store';
import type { ApiErrorDto } from '@/lib/astro/contracts';

export function unconfigured(): NextResponse {
  return NextResponse.json(
    { code: 'unconfigured', message: 'Astrologer is not configured.' } satisfies ApiErrorDto,
    { status: 503 },
  );
}

export function errorResponse(error: unknown, fallbackStatus = 500): NextResponse {
  // PostgREST returns plain objects. Preserve a safe diagnostic classification
  // without exposing database details or private row values to the browser.
  if (!(error instanceof Error) && error && typeof error === 'object' && 'code' in error) {
    const databaseCode = String(error.code);
    console.error('[astrologer-api] database request failed', { databaseCode });
    const unavailable = ['PGRST202', 'PGRST205', '42P01', '42883', '42703'].includes(databaseCode);
    return NextResponse.json({
      code: unavailable ? 'unconfigured' : 'internal',
      message: unavailable
        ? 'This feature is temporarily unavailable. Please try again after the service is updated.'
        : 'We could not save your request. Please try again.',
    } satisfies ApiErrorDto, { status: unavailable ? 503 : fallbackStatus });
  }
  if (error instanceof AgentStoreError) {
    const status =
      error.code === 'not_found' ? 404
      : error.code === 'forbidden' ? 403
      : error.code === 'conflict' ? 409
      : error.code === 'stale_version' ? 409
      : error.code === 'invalid_transition' ? 422
      : error.code === 'quota_exceeded' ? 429
      : error.code === 'invalid_request' ? 400
      : error.code === 'unconfigured' ? 503
      : fallbackStatus;
    return NextResponse.json(error.toDto(), { status });
  }
  const message = error instanceof Error ? error.message : 'internal error';
  return NextResponse.json(
    { code: 'internal', message } satisfies ApiErrorDto,
    { status: fallbackStatus },
  );
}

export interface AuthedContext {
  userId: string;
  store: AgentStore;
}

/** Authenticate the request and build the agent store with both clients. */
export async function requireAuth(): Promise<AuthedContext | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, store: new AgentStore(supabase, createAdminClient()) };
}
