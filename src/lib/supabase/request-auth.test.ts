import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookieClient: { auth: { getUser: vi.fn() } },
  tokenClient: { auth: { getUser: vi.fn() } },
  createSupabaseClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => mocks.headers }));
vi.mock('./server', () => ({ createClient: async () => mocks.cookieClient }));
vi.mock('./config', () => ({ getSupabasePublicConfig: () => ({ url: 'https://project.supabase.co', publishableKey: 'publishable' }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createSupabaseClient }));

import { bearerToken, getRequestUser } from './request-auth';

describe('request auth', () => {
  beforeEach(() => {
    mocks.headers = new Headers();
    vi.clearAllMocks();
    mocks.createSupabaseClient.mockReturnValue(mocks.tokenClient);
  });

  it('reads a Bearer token', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer  token ')).toBe('token');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('uses the cookie when no token is sent', async () => {
    mocks.cookieClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await expect(getRequestUser()).resolves.toMatchObject({ client: mocks.cookieClient, user: { id: 'u1' }, accessToken: null });
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
  });

  it('acts as the token user against the real project URL', async () => {
    mocks.headers = new Headers({ authorization: 'Bearer app-token' });
    mocks.tokenClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    await expect(getRequestUser()).resolves.toMatchObject({ client: mocks.tokenClient, user: { id: 'u2' }, accessToken: 'app-token' });
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith('https://project.supabase.co', 'publishable', expect.objectContaining({
      global: { headers: { Authorization: 'Bearer app-token' } } }));
    expect(mocks.tokenClient.auth.getUser).toHaveBeenCalledWith('app-token');
    expect(mocks.cookieClient.auth.getUser).not.toHaveBeenCalled();
  });

  it('never falls back to the cookie when a token is rejected', async () => {
    mocks.headers = new Headers({ authorization: 'Bearer expired' });
    mocks.tokenClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    mocks.cookieClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await expect(getRequestUser()).resolves.toBeNull();
    expect(mocks.cookieClient.auth.getUser).not.toHaveBeenCalled();
  });
});
