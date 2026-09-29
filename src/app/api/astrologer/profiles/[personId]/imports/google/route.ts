import { NextResponse } from 'next/server';
import { z } from 'zod';
import { driveFileItem } from '@/lib/connectors/google';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { addPendingItems, createImport, importDetail } from '@/lib/imports/store';
import type { ImportedItem } from '@/lib/imports/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  importId: z.string().uuid().nullable(),
  fileIds: z.array(z.string().min(1).max(200)).min(1).max(25),
});

/** Fetch a batch of picked Drive files into a pending import; the browser confirms it as a whole. */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'invalid_request', message: 'Invalid file selection.' }, 400);
  try {
    let importId = parsed.data.importId;
    if (importId) {
      const detail = await importDetail(owned.admin, owned.scope, importId);
      if (detail.import.provider !== 'google_drive' || detail.import.status !== 'awaiting_review') return json({ code: 'invalid_state', message: 'This import is closed.' }, 409);
    } else {
      importId = await createImport(owned.admin, owned.scope, { provider: 'google_drive', fileName: null, status: 'awaiting_review' });
    }
    const items: ImportedItem[] = [];
    const skipped: string[] = [];
    for (const fileId of parsed.data.fileIds) {
      const outcome = await driveFileItem(owned.admin, owned.scope.userId, fileId);
      if ('item' in outcome) items.push(outcome.item); else skipped.push(outcome.skipped);
    }
    await addPendingItems(owned.admin, owned.scope, importId, 'google_drive', items);
    return json({ importId, added: items.length, skipped });
  } catch (error) {
    return importErrorResponse(error);
  }
}
