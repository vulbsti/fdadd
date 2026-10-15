import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteAccount } from '@/lib/app/account-deletion';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const confirmSchema = z.object({ confirm: z.literal('DELETE') }).strict();

/**
 * Delete the account and everything it owns, then the sign-in itself.
 * Body: `{ "confirm": "DELETE" }`. Used by the app and by /account/delete.
 */
export async function DELETE(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  if (!confirmSchema.safeParse(await request.json().catch(() => null)).success) {
    return appError(400, 'confirmation_required', 'Type DELETE to confirm.');
  }
  const admin = createAdminClient();
  const { accessToken, client } = context;
  try {
    const result = await deleteAccount({
      admin,
      userId: context.userId,
      signOut: () => accessToken ? admin.auth.admin.signOut(accessToken, 'global') : client.auth.signOut({ scope: 'global' }),
    });
    return appJson({ deleted: true, ...result });
  } catch (error) {
    return appFailure('account deletion', error, 'Your account could not be deleted right now. Please try again, or write to us.');
  }
}
