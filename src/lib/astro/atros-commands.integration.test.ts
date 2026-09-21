import { describe, expect, it } from 'vitest';
import { chartArgs, runAtros } from './atros-commands';

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
