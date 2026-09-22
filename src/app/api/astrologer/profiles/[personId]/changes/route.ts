import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const base = {
  clientCommandId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
};
const schema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('add_event'),
    account: z.object({
      what: z.string().trim().min(1).max(2_000),
      when: z.string().trim().max(500).nullable().optional(),
      whatChanged: z.string().trim().max(2_000).nullable().optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('correct_account'),
    targetId: z.string().uuid(),
    account: z.object({ correction: z.string().trim().min(1).max(2_000) }).strict(),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('reject_interpretation'),
    targetId: z.string().uuid(),
    account: z.object({ explanation: z.string().trim().min(1).max(1_000) }).strict().optional(),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('add_meaning'),
    account: z.object({
      meaning: z.string().trim().min(1).max(2_000),
      context: z.string().trim().max(1_000).nullable().optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('exclude_source'),
    targetId: z.string().uuid(),
  }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request', message: 'Invalid person change.' }, { status: 400 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  let change: Record<string, unknown>;
  switch (parsed.data.kind) {
    case 'reject_interpretation':
      change = {
        kind: parsed.data.kind,
        targetObjectId: parsed.data.targetId,
        explanation: parsed.data.account?.explanation ?? 'This interpretation does not fit me.',
      };
      break;
    case 'exclude_source':
      change = { kind: parsed.data.kind, sourceId: parsed.data.targetId };
      break;
    case 'correct_account':
      change = { kind: parsed.data.kind, targetObjectId: parsed.data.targetId, payload: parsed.data.account };
      break;
    default:
      change = { kind: parsed.data.kind, payload: parsed.data.account };
  }
  const { data, error } = await client.rpc('person_submit_change', { p_person_id: personId, p_command_id: parsed.data.clientCommandId, p_expected_revision: parsed.data.expectedRevision, p_change: change });
  if (error) {
    const status = error.code === 'PST01' || error.code === 'PERS04' ? 409 : error.code === 'ANF01' ? 404 : 400;
    return NextResponse.json({ code: status === 409 ? 'stale_version' : status === 404 ? 'not_found' : 'invalid_request', message: error.message }, { status });
  }
  return NextResponse.json(data, { status: data?.replayed ? 200 : 202, headers: { 'cache-control': 'private, no-store' } });
}
