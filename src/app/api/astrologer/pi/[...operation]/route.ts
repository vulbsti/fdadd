import { z } from 'zod';
import { verifyPiAuthority } from '@/lib/astro/pi-authority';
import { assertPiAuthority, assertPiAuthorityRecent, PI_DIGEST, PiQuestionSchema, recordPiRunEvents, writePiCheckpoint } from '@/lib/astro/pi-store';
import { assemblePiTransfer, commitPiBlob, isPiArtifactPath, PiTransferError, PiTransferManifestSchema, PiTransferPartSchema,
  preparePiRestore, readPiBlobPart, readPiTransferPart, removePiTransfer, uploadPiTransferPart } from '@/lib/astro/pi-transfer';

export const runtime = 'nodejs';
export const maxDuration = 300;
const toolNameSchema = z.string().regex(/^[a-z_]{1,80}$/);
const eventSchema = z.object({ type: z.enum(['tool_execution_start', 'tool_execution_end']), toolName: toolNameSchema, toolCallId: z.string(), isError: z.boolean() });
const artifactPath = z.string().refine(isPiArtifactPath);
const checkpointSchema = z.object({
  sequence: z.number().int().positive(), final: z.boolean(), session: z.string(),
  files: z.array(z.union([
    z.object({ path: artifactPath, content: z.string() }).strict(),
    z.object({ path: artifactPath, digest: z.string().regex(PI_DIGEST), bytes: z.number().int().nonnegative() }).strict(),
  ])),
  events: z.array(eventSchema), answer: z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(), stopReason: z.string().optional() }).passthrough().nullable(),
  question: PiQuestionSchema.nullable().optional(),
});
const liveEventsSchema = z.object({
  events: z.array(z.object({
    seq: z.number().int().positive(), kind: z.enum(['text_delta', 'tool_start', 'tool_end', 'exit']),
    segment: z.number().int().nonnegative().default(0), toolName: toolNameSchema.nullable().default(null),
    toolCallId: z.string().max(200).nullable().default(null), isError: z.boolean().default(false),
    text: z.string().max(16000).nullable().default(null),
  }).strict()).max(200),
}).strict();

function isAstrologyPath(file: { path: string }) {
  return file.path.startsWith('astrology/');
}

export async function POST(request: Request, { params }: { params: Promise<{ operation: string[] }> }) {
  try {
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Missing broker configuration.');
    const authority = verifyPiAuthority(request.headers.get('x-aidoraa-run-capability') ?? '', secret);
    const operation = (await params).operation.join('/');
    // Commits and restores re-check authority against the database every time;
    // high-frequency calls reuse a check from the last few seconds.
    const fullCheck = operation === 'checkpoint' || operation === 'checkpoint/commit' || operation === 'restore';
    if (fullCheck) await assertPiAuthority(authority);
    else await assertPiAuthorityRecent(authority);
    const noStore = { headers: { 'Cache-Control': 'no-store' } };
    if (operation === 'state') return Response.json(authority, noStore);
    if (operation === 'events') {
      await recordPiRunEvents(authority, liveEventsSchema.parse(await request.json()).events);
      return Response.json({ accepted: true });
    }
    if (operation === 'restore') return Response.json(await preparePiRestore(authority), noStore);
    if (/^restore\/\d+$/.test(operation)) {
      const manifest = PiTransferManifestSchema.parse(await request.json());
      return Response.json({ content: await readPiTransferPart(authority, manifest, Number(operation.split('/')[1])) }, noStore);
    }
    if (/^restore\/blob\/[a-f0-9]{64}\/\d+$/.test(operation)) {
      const [, , digest, index] = operation.split('/');
      return Response.json(await readPiBlobPart(authority, digest, Number(index)), noStore);
    }
    if (operation === 'checkpoint/part') {
      await uploadPiTransferPart(authority, PiTransferPartSchema.parse(await request.json()));
      return Response.json({ accepted: true });
    }
    if (operation === 'blob/commit') {
      await commitPiBlob(authority, PiTransferManifestSchema.parse(await request.json()));
      return Response.json({ accepted: true });
    }
    if (operation === 'checkpoint/commit') {
      const manifest = PiTransferManifestSchema.parse(await request.json());
      const bytes = await assemblePiTransfer(authority, manifest);
      const parsed = checkpointSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (!authority.astrologyEnabled && parsed.files.some(isAstrologyPath)) throw new Error('Disabled calculation artifacts.');
      await writePiCheckpoint(authority, parsed);
      // The archive is now stored once under its digest; drop the staged copy.
      await removePiTransfer(authority, manifest);
      return Response.json({ accepted: true });
    }
    if (operation === 'checkpoint') {
      const parsed = checkpointSchema.parse(await request.json());
      if (!authority.astrologyEnabled && parsed.files.some(isAstrologyPath)) throw new Error('Disabled calculation artifacts.');
      await writePiCheckpoint(authority, parsed);
      return Response.json({ accepted: true });
    }
    if (operation !== 'model/responses') return Response.json({ error: 'Unsupported operation.' }, { status: 404 });
    const input = await request.json();
    if (!input || input.model !== 'gpt-6-luna' || !Array.isArray(input.input)) return Response.json({ error: 'Unsupported model request.' }, { status: 400 });
    const key = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim();
    if (!key) throw new Error('Model unavailable.');
    // Endpoint, model, credentials and session affinity are server-owned.
    // Preserve Pi's complete transcript and Responses stream, including metadata.
    const upstream = await fetch('https://opencode.ai/zen/go/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-opencode-session': authority.sessionId },
      body: JSON.stringify({ ...input, model: 'gpt-6-luna', store: false, tool_choice: input.tools?.length ? 'auto' : undefined, temperature: undefined }),
      signal: AbortSignal.timeout(240000),
    });
    if (!upstream.ok) {
      console.error('[pi-broker] provider rejected request', { runId: authority.runId, status: upstream.status });
      return Response.json({ error: { message: `Provider returned ${upstream.status}.` } }, { status: upstream.status });
    }
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PiTransferError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: 'Runner capability is invalid, stale, or its operation failed.' }, { status: 403 });
  }
}
