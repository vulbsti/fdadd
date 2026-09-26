import { describe, expect, it } from 'vitest';
import { Sandbox } from '@vercel/sandbox';
import { chartArgs, ensureAtrosInstalled, runAtros } from './atros-commands';

const integration = process.env.P1_ATROS_SANDBOX_INTEGRATION === '1' ? describe : describe.skip;

integration('Atros Vercel Sandbox integration', () => {
  it('returns a typed chart result from the real sandbox boundary', async () => {
    const result = await runAtros(chartArgs({
      name: 'P1 Sandbox Proof',
      date: '1990-01-01',
      time: '06:30',
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: 'Asia/Kolkata',
      place_name: 'Bengaluru',
    }), { sessionId: 'p1-sandbox-proof', timeoutMs: 120_000 });

    if (!result.ok) throw new Error(`Atros integration failed with ${result.error.code}`);
    expect(result.data).toBeTypeOf('object');
    expect(result.data).not.toBeNull();
    expect(JSON.stringify(result.data).length).toBeGreaterThan(100);
  }, 600_000);
});

const bootstrap = process.env.PI_BOOTSTRAP_INTEGRATION === '1' ? describe : describe.skip;
bootstrap('Pi fresh managed-image bootstrap', () => {
  it('installs and executes the actual vendored CLI before user data is mounted', async () => {
    const sandbox = await Sandbox.create({
      name: `aidoraa-pi-bootstrap-${Date.now()}`,
      image: 'vercel/sandbox/universal', persistent: false, timeout: 600_000,
    });
    try {
      try {
        await ensureAtrosInstalled(sandbox);
      } catch (error) {
        const diagnostic = await sandbox.runCommand('/tmp/atros-venv/bin/atros', ['--help']);
        throw new Error(`Fresh Atros bootstrap failed: ${String(error)}\n${await diagnostic.stderr()}`);
      }
      // Re-entry must verify a ready installation without reinstalling it.
      await ensureAtrosInstalled(sandbox);
      const result = await sandbox.runCommand('/tmp/atros-venv/bin/atros', [
        'timeline', '--date', '1991-02-03', '--time', '04:56',
        '--lat', '12.9716', '--lng', '77.5946', '--tz', 'Asia/Kolkata',
        '--from', '2026-01-01', '--to', '2026-12-31', '--level', 'antar', '--output', 'json',
      ], { timeoutMs: 120_000 });
      expect(result.exitCode, await result.stderr()).toBe(0);
      const output = await result.stdout();
      expect(() => JSON.parse(output)).not.toThrow();
      expect(output).toContain('2026-');
      expect(output.length).toBeGreaterThan(300);
    } finally {
      await sandbox.stop();
    }
  }, 600_000);
});
