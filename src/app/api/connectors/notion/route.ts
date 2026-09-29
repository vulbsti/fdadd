import { NextResponse } from 'next/server';
import { disconnectNotion } from '@/lib/connectors/notion';
import { importErrorResponse, json, requireUser } from '@/lib/imports/http';

export const runtime = 'nodejs';

/** Forget the Notion connection. Pages already imported stay until their import is removed. */
export async function DELETE() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    await disconnectNotion(user.admin, user.userId);
    return json({ disconnected: true });
  } catch (error) {
    return importErrorResponse(error);
  }
}
