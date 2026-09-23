import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PersonChangeCommandSchema,
  personChangeRequestFromCommand,
} from '@/lib/person-model/contracts';
import { PersonStore, PersonStoreError } from '@/lib/person-model/store';

export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  if (!z.string().uuid().safeParse(personId).success) {
    return NextResponse.json({ code: 'invalid_request', message: 'Invalid person.' }, { status: 400 });
  }
  const parsed = PersonChangeCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_request', message: 'Invalid person change.' }, { status: 400 });
  try {
    const store = await PersonStore.fromRequest();
    const receipt = await store.submitChange({
      personId,
      commandId: parsed.data.clientCommandId,
      expectedRevision: parsed.data.expectedRevision,
      change: personChangeRequestFromCommand(parsed.data),
    });
    return NextResponse.json({
      change_id: receipt.changeId,
      person_id: receipt.personId,
      source_id: receipt.sourceId,
      source_seq: receipt.sourceSeq,
      command_id: receipt.commandId,
      change_kind: receipt.kind,
      target_kind: receipt.targetKind,
      target_id: receipt.targetId,
      prior_version_id: receipt.priorVersionId,
      status: receipt.status,
      resolved_revision: receipt.resolvedRevision,
      request: receipt.request,
      invalidated_ids: receipt.invalidatedIds,
      expected_revision: receipt.expectedRevision,
      job_id: receipt.jobId,
      created_at: receipt.createdAt,
      replayed: receipt.replayed,
    }, { status: receipt.replayed ? 200 : 202, headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof PersonStoreError) {
      const status = error.code === 'unauthenticated' ? 401
        : error.code === 'not_owned_or_missing' ? 404
          : ['conflict', 'stale_revision'].includes(error.code) ? 409
            : error.code === 'unconfigured' ? 503
              : error.code === 'internal' ? 500
                : 400;
      const code = status === 401 ? 'forbidden'
        : status === 404 ? 'not_found'
          : error.code === 'stale_revision' ? 'stale_version'
            : status === 409 ? 'conflict'
            : status === 503 ? 'unconfigured'
              : status === 500 ? 'internal'
                : 'invalid_request';
      return NextResponse.json({ code, message: error.message }, { status });
    }
    return NextResponse.json({ code: 'internal', message: 'Person change failed.' }, { status: 500 });
  }
}
