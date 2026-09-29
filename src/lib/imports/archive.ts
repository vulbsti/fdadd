/**
 * Uploads arrive as a ZIP the browser built from the export's text entries.
 * Entries are only ever read as text here, never written to disk or run, but
 * expansion is still bounded so a crafted archive cannot exhaust memory.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { SourceFile } from './parsers';

/** Operational bounds of one import request, not a cap on what a person may import. */
export const MAX_EXPANDED_BYTES = 768 * 1024 * 1024;
export const MAX_ENTRIES = 20_000;
export const TEXT_ENTRY = /\.(json|txt|md|markdown|html?)$/i;

export class ArchiveError extends Error {}

export function isRelevantEntry(name: string) {
  return TEXT_ENTRY.test(name) && !name.startsWith('__MACOSX/') && !name.split('/').some((part) => part.startsWith('._'));
}

export function readArchive(bytes: Uint8Array): SourceFile[] {
  let total = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (!isRelevantEntry(file.name)) return false;
        count += 1;
        total += file.originalSize;
        if (count > MAX_ENTRIES || total > MAX_EXPANDED_BYTES) throw new ArchiveError('This export is larger than one import can hold. Split it into smaller uploads.');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('The upload is not a readable ZIP archive.');
  }
  return Object.entries(entries).map(([name, data]) => ({ name, text: strFromU8(data) }));
}
