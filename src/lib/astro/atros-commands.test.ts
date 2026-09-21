import { describe, expect, it, vi } from 'vitest';
import { executeAtrosWithRetry, type AtrosCommandResult } from './atros-commands';

function command(exitCode: number, stdout: string, stderr = ''): AtrosCommandResult {
  return {
    exitCode,
    stdout: async () => stdout,
    stderr: async () => stderr,
  };
}

describe('Atros command execution boundary', () => {
  it('returns typed JSON success on the first attempt', async () => {
    const execute = vi.fn(async () => command(0, '{"planet":"Sun"}'));
    await expect(executeAtrosWithRetry(['chart', '--output', 'json'], 25_000, execute))
      .resolves.toEqual({ ok: true, data: { planet: 'Sun' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('classifies nested ephemeris failures without retrying', async () => {
    const execute = vi.fn(async () => command(2, '', 'Swiss ephemeris data unavailable'));
    await expect(executeAtrosWithRetry(['transit', '--output', 'json'], 25_000, execute))
      .resolves.toEqual({
        ok: false,
        error: { code: 'EPHEMERIS_ERROR', message: 'Swiss ephemeris data unavailable' },
      });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON after one bounded retry', async () => {
    const execute = vi.fn(async () => command(0, 'not-json'));
    await expect(executeAtrosWithRetry(['chart', '--output', 'json'], 25_000, execute))
      .resolves.toEqual({
        ok: false,
        error: { code: 'INTERNAL', message: 'atros returned non-JSON output' },
      });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('recovers when a slow first call times out and the retry succeeds', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('command timed out'))
      .mockResolvedValueOnce(command(0, 'current dasha'));
    await expect(executeAtrosWithRetry(['current'], 25_000, execute))
      .resolves.toEqual({ ok: true, data: 'current dasha' });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('returns a typed internal failure after both attempts time out', async () => {
    const execute = vi.fn(async () => { throw new Error('command timed out'); });
    await expect(executeAtrosWithRetry(['current'], 25_000, execute))
      .resolves.toEqual({
        ok: false,
        error: { code: 'INTERNAL', message: 'command timed out' },
      });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
