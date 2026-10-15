import { NextResponse } from 'next/server';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { HomeLayoutRequestSchema } from '@/lib/app/home-layout';

export const runtime = 'nodejs';

/** Save the home screen layout: `{ layout: [{ id, size }] }`, or `{ layout: null }` for the default. */
export async function PUT(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const parsed = HomeLayoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'That layout could not be saved.');
  const saved = await context.client.from('app_preferences')
    .upsert({ user_id: context.userId, home_layout: parsed.data.layout }, { onConflict: 'user_id' });
  if (saved.error) return appFailure('home layout save', saved.error);
  return appJson({ homeLayout: parsed.data.layout });
}
