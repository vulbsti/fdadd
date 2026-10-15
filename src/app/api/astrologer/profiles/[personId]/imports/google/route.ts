import { NextResponse } from 'next/server';
import { z } from 'zod';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { addDriveFiles } from '@/lib/imports/drive';

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
    return json(await addDriveFiles(owned.admin, owned.scope, parsed.data.importId, parsed.data.fileIds));
  } catch (error) {
    return importErrorResponse(error);
  }
}
