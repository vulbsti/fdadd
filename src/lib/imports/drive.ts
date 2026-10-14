import type { SupabaseClient } from '@supabase/supabase-js';
import { driveFileItem } from '@/lib/connectors/google';
import { addPendingItems, createImport, importDetail, ImportError, type OwnerScope } from './store';
import type { ImportedItem } from './types';

/**
 * Fetch a batch of picked Drive files into a pending Google Drive import
 * (a new one when `importId` is null). Used by the web imports page and by
 * the app's picker page; the import is then reviewed and confirmed as a whole.
 */
export async function addDriveFiles(admin: SupabaseClient, scope: OwnerScope, importId: string | null, fileIds: string[]) {
  if (importId) {
    const detail = await importDetail(admin, scope, importId);
    if (detail.import.provider !== 'google_drive' || detail.import.status !== 'awaiting_review') {
      throw new ImportError('invalid_state', 'This import is closed.');
    }
  } else {
    importId = await createImport(admin, scope, { provider: 'google_drive', fileName: null, status: 'awaiting_review' });
  }
  const items: ImportedItem[] = [];
  const skipped: string[] = [];
  for (const fileId of fileIds) {
    const outcome = await driveFileItem(admin, scope.userId, fileId);
    if ('item' in outcome) items.push(outcome.item); else skipped.push(outcome.skipped);
  }
  await addPendingItems(admin, scope, importId, 'google_drive', items);
  return { importId, added: items.length, skipped };
}
