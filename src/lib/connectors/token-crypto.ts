/**
 * Connector tokens are encrypted before they reach the database, so a leaked
 * table dump alone does not grant access to anyone's connected workspace.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = (process.env.CONNECTOR_TOKEN_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!secret) throw new Error('Connector token encryption is not configured.');
  return createHash('sha256').update(`aidoraa-connector-token:${secret}`).digest();
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptToken(sealed: string) {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable connector token.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
