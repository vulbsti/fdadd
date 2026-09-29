import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notionConfig, notionConnection } from '@/lib/connectors/notion';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';
import { createImport, createUploadTarget, IMPORT_BUCKET, listImports } from '@/lib/imports/store';
import { ImportProviderSchema } from '@/lib/imports/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ personId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  try {
    const [imports, notion] = await Promise.all([listImports(owned.admin, owned.scope), notionConnection(owned.admin, owned.scope.userId)]);
    return json({ imports, notion: { configured: Boolean(notionConfig()), connected: Boolean(notion), workspaceName: notion?.workspaceName ?? null } });
  } catch (error) {
    return importErrorResponse(error);
  }
}

const createSchema = z.object({
  provider: ImportProviderSchema.exclude(['notion']),
  fileName: z.string().min(1).max(300),
});

/** Start a file import: returns a one-time URL the browser uploads the export to. */
export async function POST(request: Request, { params }: Params) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'invalid_request', message: 'Invalid import.' }, 400);
  try {
    const importId = await createImport(owned.admin, owned.scope, { provider: parsed.data.provider, fileName: parsed.data.fileName, status: 'uploading' });
    const target = await createUploadTarget(owned.admin, owned.scope, importId);
    return json({ importId, bucket: IMPORT_BUCKET, path: target.path, token: target.token }, 201);
  } catch (error) {
    return importErrorResponse(error);
  }
}
