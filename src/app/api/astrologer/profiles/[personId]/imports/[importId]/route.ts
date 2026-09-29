import { NextResponse } from 'next/server';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { deleteImport, importDetail } from '@/lib/imports/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ personId: string; importId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { personId, importId } = await params;
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return owned;
  try {
    return json(await importDetail(owned.admin, owned.scope, importId));
  } catch (error) {
    return importErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { personId, importId } = await params;
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return owned;
  try {
    await deleteImport(owned.admin, owned.scope, importId);
    return json({ deleted: true });
  } catch (error) {
    return importErrorResponse(error);
  }
}
