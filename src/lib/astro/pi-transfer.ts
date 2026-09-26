import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { piArtifactPrefix, type PiAuthority } from './pi-authority';
import { assertPiAuthority, PI_BUCKET, readPiRecovery } from './pi-store';

export const PI_CHUNK_BYTES = 1024 * 1024;
export const PI_MAX_ARCHIVE_BYTES = 50 * PI_CHUNK_BYTES;

export function isPiArtifactPath(value: string): boolean {
  return /^(work|proposals|outputs|astrology\/calculations)\//.test(value)
    && !/[\0\\]/.test(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export class PiTransferError extends Error {}
export const PiTransferManifestSchema = z.object({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive().max(PI_MAX_ARCHIVE_BYTES),
  parts: z.number().int().positive().max(50),
}).strict().refine((manifest) => manifest.parts === Math.ceil(manifest.byteLength / PI_CHUNK_BYTES), 'Invalid transfer part count.');
export type PiTransferManifest = z.infer<typeof PiTransferManifestSchema>;
export const PiTransferPartSchema = z.object({
  manifest: PiTransferManifestSchema,
  index: z.number().int().nonnegative().max(49),
  content: z.string().max(Math.ceil(PI_CHUNK_BYTES / 3) * 4),
}).strict();

function parseManifest(input: PiTransferManifest): PiTransferManifest {
  const parsed = PiTransferManifestSchema.safeParse(input);
  if (!parsed.success) throw new PiTransferError('Invalid checkpoint transfer manifest; prototype archives must fit within 50 MiB.');
  return parsed.data;
}

function decodePart(manifest: PiTransferManifest, index: number, content: string): Buffer {
  if (!Number.isInteger(index) || index < 0 || index >= manifest.parts || typeof content !== 'string'
    || content.length > Math.ceil(PI_CHUNK_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    throw new PiTransferError('Invalid checkpoint transfer part.');
  }
  const bytes = Buffer.from(content, 'base64');
  const expected = Math.min(PI_CHUNK_BYTES, manifest.byteLength - index * PI_CHUNK_BYTES);
  if (bytes.length !== expected || bytes.toString('base64') !== content) {
    throw new PiTransferError('Checkpoint transfer part is incomplete or not canonical base64.');
  }
  return bytes;
}

export function encodePiTransfer(bytes: Buffer): { manifest: PiTransferManifest; chunks: string[] } {
  if (!bytes.length || bytes.length > PI_MAX_ARCHIVE_BYTES) {
    throw new PiTransferError('Checkpoint exceeds the prototype 50 MiB archive budget; no data was truncated.');
  }
  const manifest = { digest: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length,
    parts: Math.ceil(bytes.length / PI_CHUNK_BYTES) };
  const chunks = Array.from({ length: manifest.parts }, (_, index) =>
    bytes.subarray(index * PI_CHUNK_BYTES, (index + 1) * PI_CHUNK_BYTES).toString('base64'));
  return { manifest, chunks };
}

export function decodePiTransfer(input: PiTransferManifest, chunks: string[]): Buffer {
  const manifest = parseManifest(input);
  if (chunks.length !== manifest.parts) throw new PiTransferError('Checkpoint transfer parts are missing.');
  const bytes = Buffer.concat(chunks.map((content, index) => decodePart(manifest, index, content)), manifest.byteLength);
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.digest) throw new PiTransferError('Checkpoint transfer digest mismatch.');
  return bytes;
}

const binding = (authority: PiAuthority) => ({ runId: authority.runId, userId: authority.userId,
  personId: authority.personId, sessionId: authority.sessionId, modeEpoch: authority.modeEpoch,
  privacyEpoch: authority.privacyEpoch, birthRevision: authority.birthRevision, astrologyEnabled: authority.astrologyEnabled });
const prefix = (authority: PiAuthority, manifest: PiTransferManifest) => `${piArtifactPrefix(authority)}/transfer/${manifest.digest}`;

async function uploadImmutable(path: string, bytes: Buffer, contentType: string) {
  const bucket = createAdminClient().storage.from(PI_BUCKET);
  const uploaded = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (!uploaded.error) return;
  // A lost upload response is safely replayed only when the stored bytes agree.
  const existing = await bucket.download(path);
  if (existing.error || !existing.data || !Buffer.from(await existing.data.arrayBuffer()).equals(bytes)) {
    throw new PiTransferError('Private checkpoint transfer upload failed or conflicted.');
  }
}

async function storeManifest(authority: PiAuthority, manifest: PiTransferManifest) {
  await uploadImmutable(`${prefix(authority, manifest)}/manifest.json`,
    Buffer.from(JSON.stringify({ ...manifest, authority: binding(authority) })), 'application/json');
}

async function assertStoredManifest(authority: PiAuthority, manifest: PiTransferManifest) {
  const result = await createAdminClient().storage.from(PI_BUCKET).download(`${prefix(authority, manifest)}/manifest.json`);
  if (result.error || !result.data) throw new PiTransferError('Private checkpoint transfer manifest is unavailable.');
  let stored: unknown;
  try { stored = JSON.parse(await result.data.text()); } catch { throw new PiTransferError('Private checkpoint transfer manifest is invalid.'); }
  if (JSON.stringify(stored) !== JSON.stringify({ ...manifest, authority: binding(authority) })) {
    throw new PiTransferError('Checkpoint transfer does not match the current run authority.');
  }
}

export async function uploadPiTransferPart(authority: PiAuthority, input: z.infer<typeof PiTransferPartSchema>) {
  await assertPiAuthority(authority);
  const manifest = parseManifest(input.manifest);
  const bytes = decodePart(manifest, input.index, input.content);
  await storeManifest(authority, manifest);
  await uploadImmutable(`${prefix(authority, manifest)}/${input.index}`, bytes, 'application/octet-stream');
}

export async function readPiTransferPart(authority: PiAuthority, input: PiTransferManifest, index: number) {
  await assertPiAuthority(authority);
  const manifest = parseManifest(input);
  if (!Number.isInteger(index) || index < 0 || index >= manifest.parts) throw new PiTransferError('Invalid checkpoint transfer index.');
  await assertStoredManifest(authority, manifest);
  const result = await createAdminClient().storage.from(PI_BUCKET).download(`${prefix(authority, manifest)}/${index}`);
  if (result.error || !result.data) throw new PiTransferError('Private checkpoint transfer part is unavailable.');
  const content = Buffer.from(await result.data.arrayBuffer()).toString('base64');
  decodePart(manifest, index, content);
  return content;
}

export async function assemblePiTransfer(authority: PiAuthority, input: PiTransferManifest) {
  const manifest = parseManifest(input);
  const chunks: string[] = [];
  for (let index = 0; index < manifest.parts; index++) chunks.push(await readPiTransferPart(authority, manifest, index));
  return decodePiTransfer(manifest, chunks);
}

export async function preparePiRestore(authority: PiAuthority) {
  await assertPiAuthority(authority);
  const recovery = await readPiRecovery(authority);
  if (!recovery) return null;
  const transfer = encodePiTransfer(Buffer.from(JSON.stringify(recovery.checkpoint)));
  await storeManifest(authority, transfer.manifest);
  for (let index = 0; index < transfer.chunks.length; index++) {
    await assertPiAuthority(authority);
    await uploadImmutable(`${prefix(authority, transfer.manifest)}/${index}`,
      decodePart(transfer.manifest, index, transfer.chunks[index]), 'application/octet-stream');
  }
  return { ...transfer.manifest, sameRun: recovery.sameRun };
}
