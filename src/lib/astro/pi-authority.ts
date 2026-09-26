import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const PiAuthoritySchema = z.object({
  runId: z.string().uuid(), userId: z.string().uuid(), personId: z.string().uuid(), sessionId: z.string().uuid(),
  modeEpoch: z.number().int().nonnegative(), privacyEpoch: z.number().int().nonnegative(), birthRevision: z.number().int().nonnegative(),
  astrologyEnabled: z.boolean(), expiresAt: z.number().int().positive(),
}).strict();
export type PiAuthority = z.infer<typeof PiAuthoritySchema>;

export function signPiAuthority(authority: PiAuthority, secret: string): string {
  const payload = Buffer.from(JSON.stringify(PiAuthoritySchema.parse(authority))).toString('base64url');
  const signature = createHmac('sha256', secret).update(`aidoraa-pi-v1:${payload}`).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyPiAuthority(token: string, secret: string, now = Date.now()): PiAuthority {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid runner capability.');
  const expected = createHmac('sha256', secret).update(`aidoraa-pi-v1:${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid runner capability.');
  const authority = PiAuthoritySchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  if (authority.expiresAt <= now) throw new Error('Expired runner capability.');
  return authority;
}

export function piArtifactPrefix(authority: PiAuthority): string {
  return `${authority.userId}/${authority.personId}/${authority.runId}`;
}

export function piRuntimeEnabled(env = process.env): boolean {
  if (env.ASTROLOGER_RUNTIME !== 'pi') return false;
  // New runtime remains isolated until the Preview acceptance gate is complete.
  if (env.VERCEL_ENV === 'production' || env.NEXT_PUBLIC_SUPABASE_URL !== 'https://wtloawiwntyjiidjbmuk.supabase.co') {
    throw new Error('Pi runtime currently requires the isolated staging database and a non-production deployment.');
  }
  return true;
}
