import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';

export const runtime = 'nodejs';

const profileSchema = z.object({
  // An empty name clears it; the app then falls back to the sign-in name.
  displayName: z.string().trim().max(80).transform((value) => value || null).nullable().optional(),
}).strict();

export async function PATCH(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'Names can be up to 80 characters.');
  const changes = parsed.data.displayName === undefined ? {} : { display_name: parsed.data.displayName };
  const saved = await context.client.from('profiles').upsert({ id: context.userId, ...changes }, { onConflict: 'id' })
    .select('display_name,avatar_url').single();
  if (saved.error) return appFailure('profile save', saved.error);
  return appJson({ displayName: saved.data.display_name ?? null, avatarUrl: saved.data.avatar_url ?? null });
}
