import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { astroProfileInit } from '@/lib/astro/tools';

export const runtime = 'nodejs';

const birthSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(100),
  place_name: z.string().max(300).optional(),
  time_source: z.string().max(50).optional(),
  time_confidence: z.string().max(50).optional(),
});

const createSchema = z.object({
  profile_id: z.string().uuid().optional(),
  birth: birthSchema.optional(),
});

/** List the caller's astrologer sessions, newest first. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Astrologer is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('astro_sessions')
    .select('id, profile_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: 'Could not list sessions.' }, { status: 500 });
  }
  return NextResponse.json({ sessions: data });
}

/**
 * Open a session. With `birth`, runs the intake turn inline
 * (`astroProfileInit` → chart+sensitivity → frozen facts) and links the profile.
 */
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid session request.' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Astrologer is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: session, error } = await supabase
    .from('astro_sessions')
    .insert({ user_id: user.id, profile_id: parsed.data.profile_id ?? null })
    .select('id')
    .single();
  if (error || !session) {
    return NextResponse.json({ error: 'Could not open session.' }, { status: 500 });
  }
  const sessionId = session.id as string;

  if (parsed.data.birth) {
    try {
      const profile = await astroProfileInit(supabase, user.id, sessionId, parsed.data.birth);
      await supabase
        .from('astro_sessions')
        .update({ profile_id: profile.id })
        .eq('id', sessionId)
        .eq('user_id', user.id);
      await supabase.from('astro_messages').insert({
        user_id: user.id,
        session_id: sessionId,
        role: 'assistant',
        content: `Your chart is calculated and frozen. Ask me about timing, transits, or the patterns shaping this period — or tell me a life event with its date so I can test it against your dasha chain.`,
      });
      return NextResponse.json({ sessionId, profileId: profile.id });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Intake failed.' },
        { status: 422 },
      );
    }
  }

  return NextResponse.json({ sessionId, profileId: parsed.data.profile_id ?? null });
}
