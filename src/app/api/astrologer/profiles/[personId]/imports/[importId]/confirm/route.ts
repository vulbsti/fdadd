import { NextResponse } from 'next/server';
import { z } from 'zod';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { confirmImport } from '@/lib/imports/store';

export const runtime = 'nodejs';

const schema = z.object({
  itemIds: z.array(z.string().uuid()).max(100_000),
  personSpeaker: z.string().min(1).max(100).nullable(),
});

/** Import the reviewed selection. Unselected items are discarded. */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string; importId: string }> }) {
  const { personId, importId } = await params;
  const owned = await requireOwnedPerson(personId);
  if (owned instanceof NextResponse) return owned;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'invalid_request', message: 'Invalid selection.' }, 400);
  try {
    return json(await confirmImport(owned.admin, owned.scope, importId, parsed.data.itemIds, parsed.data.personSpeaker));
  } catch (error) {
    return importErrorResponse(error);
  }
}
