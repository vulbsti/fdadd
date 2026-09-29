import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptToken } from './token-crypto';
import { driveFileItem, googleAuthorizeUrl } from './google';

process.env.SUPABASE_SECRET_KEY = 'test-secret';

function admin(expiresAt: string) {
  const row = { access_token: encryptToken('access-1'), refresh_token: encryptToken('refresh-1'), token_expires_at: expiresAt };
  const updates: unknown[] = [];
  const chain = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
    update: (values: unknown) => { updates.push(values); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
  };
  return { client: { from: () => chain } as never, updates };
}

afterEach(() => vi.unstubAllGlobals());

describe('Google connector', () => {
  it('asks only for per-file Drive access, offline', () => {
    const url = new URL(googleAuthorizeUrl('client', 'https://x.test/cb', 'state'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });

  it('exports a Google Doc as Markdown', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/export?')) return new Response('# Plans\n\nMove in spring');
      return Response.json({ id: 'doc-1', name: 'Plans', mimeType: 'application/vnd.google-apps.document', createdTime: '2025-01-01T00:00:00Z', modifiedTime: '2025-02-01T00:00:00Z', webViewLink: 'https://docs.google.com/d/doc-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await driveFileItem(admin(new Date(Date.now() + 3_600_000).toISOString()).client, 'user', 'doc-1');
    expect(outcome).toEqual({ item: expect.objectContaining({ externalId: 'doc-1', kind: 'document', title: 'Plans', body: '# Plans\n\nMove in spring', endedAt: '2025-02-01T00:00:00Z' }) });
    expect(String(fetchMock.mock.calls[1][0])).toContain('mimeType=text%2Fmarkdown');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer access-1' } });
  });

  it('refreshes an expired token and skips files it cannot read as text', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'access-2', expires_in: 3600 });
      return Response.json({ id: 'pdf-1', name: 'Scan.pdf', mimeType: 'application/pdf' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = admin(new Date(Date.now() - 1000).toISOString());
    const outcome = await driveFileItem(store.client, 'user', 'pdf-1');
    expect(outcome).toEqual({ skipped: expect.stringContaining('not a text document') });
    expect(store.updates).toHaveLength(1);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { authorization: 'Bearer access-2' } });
  });
});
