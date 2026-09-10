import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { runAstrologerTurn } from '@/lib/astro/loop';

export const runtime = 'nodejs';

const DAILY_TOOL_CALL_LIMIT = 100;

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sseStream(answer: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = answer.match(/[\s\S]{1,200}/g) ?? [];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

export async function POST(request: Request) {
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid chat request.' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Astrologer is not configured.' }, { status: 503 });
  }
  const { sessionId, message } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: session } = await supabase
    .from('astro_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();
  if (!session) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const day = todayISO();
  const { data: quota } = await supabase
    .from('astro_quotas')
    .select('tool_calls')
    .eq('user_id', user.id)
    .eq('day', day)
    .single();
  if (quota && (quota.tool_calls as number) >= DAILY_TOOL_CALL_LIMIT) {
    return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 });
  }

  const turn = await runAstrologerTurn({
    client: supabase,
    userId: user.id,
    sessionId,
    message,
  });

  if (turn.toolCalls > 0) {
    const used = (quota?.tool_calls as number | undefined) ?? 0;
    await supabase.from('astro_quotas').upsert(
      { user_id: user.id, day, tool_calls: used + turn.toolCalls },
      { onConflict: 'user_id,day' },
    );
  }

  return new Response(sseStream(turn.answer), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
}
