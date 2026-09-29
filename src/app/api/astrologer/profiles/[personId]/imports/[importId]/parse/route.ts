import { NextResponse } from 'next/server';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { importDetail, parseUploadedImport } from '@/lib/imports/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Read the uploaded export into reviewable items. The raw upload is deleted afterwards. */
export async function POST(_request: Request, { params }: { params: Promise<{ personId: string; importId: string }> }) {
  const { personId, importId } = await params;
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return owned;
  try {
    await parseUploadedImport(owned.admin, owned.scope, importId);
    return json(await importDetail(owned.admin, owned.scope, importId));
  } catch (error) {
    return importErrorResponse(error);
  }
}
