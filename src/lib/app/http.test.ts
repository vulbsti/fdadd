import { describe, expect, it, vi } from 'vitest';
import { appFailure } from './http';

describe('appFailure', () => {
  it('answers an expired sign-in token with 401 so the app refreshes it', async () => {
    const response = appFailure('bootstrap', { code: 'PGRST303', message: 'JWT expired' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Please sign in again.' });
  });

  it('keeps other failures generic', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = appFailure('bootstrap', { code: '42P01' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'internal', message: 'Something went wrong. Please try again.' });
  });
});
