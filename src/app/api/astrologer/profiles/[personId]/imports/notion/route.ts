import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notionPageItem } from '@/lib/connectors/notion';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { addPendingItems, createImport, importDetail } from '@/lib/imports/store';
import type { ImportedItem } from '@/lib/imports/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  importId: z.string().uuid().nullable(),
  pageIds: z.array(z.string().min(1).max(100)).min(1).max(25),
});

/**
 * Fetch a batch of chosen Notion pages into a pending import. The browser
 * sends the selection in batches, then confirms the import as a whole.
 */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'invalid_request', message: 'Invalid page selection.' }, 400);
  try {
    let importId = parsed.data.importId;
    if (importId) {
      const detail = await importDetail(owned.admin, owned.scope, importId);
      if (detail.import.provider !== 'notion' || detail.import.status !== 'awaiting_review') return json({ code: 'invalid_state', message: 'This import is closed.' }, 409);
    } else {
      importId = await createImport(owned.admin, owned.scope, { provider: 'notion', fileName: null, status: 'awaiting_review' });
    }
    const items: ImportedItem[] = [];
    const skipped: string[] = [];
    for (const pageId of parsed.data.pageIds) {
      const item = await notionPageItem(owned.admin, owned.scope.userId, pageId).catch((error) => {
        if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) return null;
        throw error;
      });
      if (item) items.push(item); else skipped.push(pageId);
    }
    await addPendingItems(owned.admin, owned.scope, importId, 'notion', items);
    return json({ importId, added: items.length, skipped });
  } catch (error) {
    return importErrorResponse(error);
  }
}
