import { NextResponse } from 'next/server';
import { searchNotionPages } from '@/lib/connectors/notion';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';

export const runtime = 'nodejs';

/** Pages the person shared with the Aidoraa integration, newest edits first. */
export async function GET(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  const url = new URL(request.url);
  try {
    return json(await searchNotionPages(owned.admin, owned.scope.userId, {
      cursor: url.searchParams.get('cursor'), query: url.searchParams.get('q')?.slice(0, 200) || null,
    }));
  } catch (error) {
    return importErrorResponse(error);
  }
}
