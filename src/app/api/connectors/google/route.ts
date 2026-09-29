import { NextResponse } from 'next/server';
import { disconnectGoogle } from '@/lib/connectors/google';
import { importErrorResponse, json, requireUser } from '@/lib/imports/http';

export const runtime = 'nodejs';

/** Forget the Google connection. Files already imported stay until their import is removed. */
export async function DELETE() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    await disconnectGoogle(user.admin, user.userId);
    return json({ disconnected: true });
  } catch (error) {
    return importErrorResponse(error);
  }
}
