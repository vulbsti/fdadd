import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(20),
  beforeCreatedAt: z.string().datetime({ offset: true }).optional(),
  beforeMessageId: z.string().uuid().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const { personId } = await params;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q'),
    limit: url.searchParams.get('limit') ?? undefined,
    beforeCreatedAt: url.searchParams.get('beforeCreatedAt') ?? undefined,
    beforeMessageId: url.searchParams.get('beforeMessageId') ?? undefined,
  });
  if (!parsed.success || Boolean(parsed.data?.beforeCreatedAt) !== Boolean(parsed.data?.beforeMessageId)) {
    return NextResponse.json({ code: 'invalid_request', message: 'Invalid search request.' }, { status: 400 });
  }
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  const { data, error } = await client.rpc('person_search_conversations', {
    p_profile_id: personId,
    p_query: parsed.data.q,
    p_before_created_at: parsed.data.beforeCreatedAt ?? null,
    p_before_message_id: parsed.data.beforeMessageId ?? null,
    p_limit: parsed.data.limit,
  });
  if (error) {
    const status = error.code === 'ANF01' ? 404 : 400;
    return NextResponse.json(
      { code: status === 404 ? 'not_found' : 'invalid_request', message: error.message },
      { status },
    );
  }
  const results = (data ?? []).map((row: Record<string, unknown>) => ({
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    messageId: row.message_id,
    role: row.message_role,
    excerpt: row.excerpt,
    createdAt: row.created_at,
    sourceSeq: row.source_seq,
    inclusionStatus: row.inclusion_status,
    rank: row.rank,
  }));
  return NextResponse.json({ results }, { headers: { 'cache-control': 'private, no-store' } });
}
