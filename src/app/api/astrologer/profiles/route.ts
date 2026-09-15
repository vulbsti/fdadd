/** Owned profile summaries for the New Reading profile chooser. */

import { NextResponse } from 'next/server';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { ProfileSummarySchema, type ProfileSummary } from '@/lib/astro/contracts';

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
