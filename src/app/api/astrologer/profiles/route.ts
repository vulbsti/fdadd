/** Owned profile summaries for the New Reading profile chooser. */

import { NextResponse } from 'next/server';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { ProfileSummarySchema, type ProfileSummary } from '@/lib/astro/contracts';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  try {
    const rows = await auth.store.listProfiles(auth.userId);
    const profiles: ProfileSummary[] = rows.map((row) =>
      ProfileSummarySchema.parse({
        id: row.id,
        name: row.name,
        initializationStatus: row.initialization_status,
        initializationError: row.initialization_error ?? null,
        hasChart: row.chart_json != null,
        createdAt: row.created_at,
      }),
    );
    return NextResponse.json({ profiles });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().uuid(),
});

/** Name-only person creation; birth/chart readiness is intentionally separate. */
export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request', message: 'Enter a name.' }, { status: 400 });
  try {
    const client = await createClient();
    const { data, error } = await client.rpc('person_create', {
      p_name: parsed.data.name,
      p_command_id: parsed.data.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data, { status: data?.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
