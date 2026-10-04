// Capability tokens shared by the Vercel app (signer) and the Worker
// (verifier). Web Crypto only, so the same file runs in both and in tests.
const encoder = new TextEncoder();
const CONTEXT = 'aidoraa-edge-v1:';

const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64Url = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** @param {{scope: 'run'|'server'|'watch', exp: number, userId?: string, personId?: string, runId?: string}} claims */
export async function signEdgeToken(claims, secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(CONTEXT + payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the claims, or null for anything malformed, forged or expired. */
export async function verifyEdgeToken(token, secret, now = Date.now()) {
  try {
    const [payload, signature, extra] = String(token ?? '').split('.');
    if (!payload || !signature || extra !== undefined || !secret) return null;
    // subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromBase64Url(signature), encoder.encode(CONTEXT + payload));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!['run', 'server', 'watch'].includes(claims.scope) || typeof claims.exp !== 'number' || claims.exp <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OBJECT_KEY = new RegExp(`^(${UUID})/(${UUID})/(?:(${UUID})/([a-f0-9]{64})\\.json|blobs/([a-f0-9]{64}))$`);

/**
 * What a token may do with one object key. A run may write only its own
 * checkpoint archives and its person's content-addressed blobs, and read any
 * archive or blob of that person (a new run restores from an earlier one).
 * Returns the SHA-256 the stored bytes must have, when the key names one.
 */
export function authorizeObject(claims, method, key) {
  if (!claims) return { allowed: false };
  const match = OBJECT_KEY.exec(key);
  const digest = match ? match[4] ?? match[5] : null;
  if (claims.scope === 'server') return { allowed: true, digest };
  if (claims.scope !== 'run' || !match || match[1] !== claims.userId || match[2] !== claims.personId) return { allowed: false };
  if (method === 'GET' || method === 'HEAD') return { allowed: true, digest };
  if (method === 'PUT') return { allowed: match[3] === undefined || match[3] === claims.runId, digest };
  return { allowed: false };
}
