import { describe, expect, it, vi } from 'vitest';
import { appConnectorLink, appImportsLink, appOAuthState, consumeHandoff, issueHandoff, parseAppOAuthState } from './handoff';

/** A tiny stand-in for the tickets table: enough to check hashing, kinds, expiry and single use. */
function fakeAdmin() {
  const rows: Array<Record<string, unknown>> = [];
  const admin = {
    rows,
    from: () => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let mode: 'select' | 'delete' = 'select';
      const query = {
        delete: () => { mode = 'delete'; return query; },
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        gt: (column: string, value: string) => { filters.push((row) => String(row[column]) > value); return query; },
        lt: (column: string, value: string) => { filters.push((row) => String(row[column]) < value); return query; },
        insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; },
        then: (resolve: (value: unknown) => void) => {
          const matched = rows.filter((row) => filters.every((filter) => filter(row)));
          if (mode === 'delete') for (const row of matched) rows.splice(rows.indexOf(row), 1);
          resolve({ data: matched, error: null });
        },
      };
      return query;
    },
  };
  return admin;
}

describe('app handoffs', () => {
  it('stores only a hash and can be used once, for its own purpose', async () => {
    const admin = fakeAdmin();
    const token = await issueHandoff(admin as never, { kind: 'oauth_google', userId: 'u', personId: 'p' });
    expect(admin.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(admin.rows)).not.toContain(token);
    expect(await consumeHandoff(admin as never, 'oauth_notion', token)).toBeNull();
    expect(await consumeHandoff(admin as never, 'oauth_google', token)).toMatchObject({ userId: 'u', personId: 'p', kind: 'oauth_google' });
    expect(await consumeHandoff(admin as never, 'oauth_google', token)).toBeNull();
    expect(await consumeHandoff(admin as never, 'oauth_google', 'not a token')).toBeNull();
  });

  it('refuses an expired token', async () => {
    vi.useFakeTimers();
    try {
      const admin = fakeAdmin();
      const token = await issueHandoff(admin as never, { kind: 'google_picker', userId: 'u', personId: 'p' });
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(await consumeHandoff(admin as never, 'google_picker', token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells app OAuth states from web ones', () => {
    expect(parseAppOAuthState(appOAuthState('abc'))).toBe('abc');
    expect(parseAppOAuthState('Zm9vYmFy')).toBeNull();
    expect(parseAppOAuthState(null)).toBeNull();
  });

  it('builds the links back into the app', () => {
    expect(appConnectorLink('notion', 'connected')).toBe('aidoraa://connectors/notion?result=connected');
    expect(appImportsLink({ result: 'imported', count: 3, personId: 'p', importId: 'i' }))
      .toBe('aidoraa://imports?result=imported&count=3&personId=p&importId=i');
    expect(appImportsLink({ result: 'cancelled' })).toBe('aidoraa://imports?result=cancelled&count=0');
  });
});
