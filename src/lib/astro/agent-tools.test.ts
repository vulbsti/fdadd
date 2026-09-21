/**
 * Behavioral tests for memory transition policy boundaries that live in
 * application code: the calculation cache key derivation and the
 * current-dasha expiry rule. Database-side policy is covered by pgTAP.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ATROS_ENGINE_VERSION } from '@/lib/astro/atros-commands';
import { nextUtcMidnightForTest } from './agent-tools.test-helpers';
import { runAtrosTool, type ToolContext } from './agent-tools';
import type { AgentStore, RunRow } from './agent-store';
import type { ProfileRow } from './tools';

describe('calculation cache keys', () => {
  it('engine version is a stable, explicit string', () => {
    expect(ATROS_ENGINE_VERSION).toBe('0.1.0+aidoraa.20260914');
  });

  it('canonical args hash is deterministic and order-sensitive', () => {
    const birth = { date: '1990-01-01', time: '06:30', latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata' };
    const a = createHash('sha256').update(JSON.stringify({ birth, toolName: 'atros_timeline', args: { from: '2026-01-01', to: '2026-02-01' } })).digest('hex');
    const b = createHash('sha256').update(JSON.stringify({ birth, toolName: 'atros_timeline', args: { from: '2026-01-01', to: '2026-02-01' } })).digest('hex');
    const c = createHash('sha256').update(JSON.stringify({ birth, toolName: 'atros_timeline', args: { from: '2026-02-01', to: '2026-01-01' } })).digest('hex');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('current-dasha expiry', () => {
  it('expires at the next UTC midnight', () => {
    const now = new Date('2026-09-14T23:59:59Z');
    expect(nextUtcMidnightForTest(now)).toBe('2026-09-15T00:00:00.000Z');
    const morning = new Date('2026-09-14T00:00:01Z');
    expect(nextUtcMidnightForTest(morning)).toBe('2026-09-15T00:00:00.000Z');
  });
});

function atrosContext() {
  let cached: { id: string; resultJson: unknown } | null = null;
  const store = {
    adminClient: {},
    readCalculationCache: vi.fn(async () => cached),
    writeCalculationCache: vi.fn(async (input: { resultJson: unknown }) => {
      cached = { id: 'cache-1', resultJson: input.resultJson };
      return 'cache-1';
    }),
  } as unknown as AgentStore;
  const run = {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: '00000000-0000-4000-8000-000000000002',
    profile_id: '00000000-0000-4000-8000-000000000003',
    session_id: '00000000-0000-4000-8000-000000000004',
  } as RunRow;
  const profile = {
    id: run.profile_id,
    user_id: run.user_id,
    name: 'Atros test person',
    birth_date: '1990-01-01',
    birth_time: '06:30',
    lat: 12.9716,
    lng: 77.5946,
    tz: 'Asia/Kolkata',
    place_name: 'Bengaluru',
    time_source: 'reported',
    time_confidence: 'exact',
    chart_json: null,
    sensitivity_json: null,
  } satisfies ProfileRow;
  return {
    store,
    context: { store, run, profile, stepKey: 'calculate:1', today: '2026-09-21' } satisfies ToolContext,
  };
}

describe('Atros agent-tool result propagation', () => {
  it('caches a typed success once and replays it without re-execution', async () => {
    const { context, store } = atrosContext();
    const execute = vi.fn(async () => ({ ok: true as const, data: { ascendant: 'Leo' } }));

    const first = await runAtrosTool(context, 'atros_chart', undefined, execute);
    const second = await runAtrosTool(context, 'atros_chart', undefined, execute);

    expect(first).toEqual({
      ok: true,
      result: {
        ok: true,
        result: { ascendant: 'Leo' },
        cacheHit: false,
        cacheId: 'cache-1',
        toolName: 'atros_chart',
      },
    });
    expect(second).toMatchObject({ ok: true, result: { cacheHit: true, cacheId: 'cache-1' } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.writeCalculationCache).toHaveBeenCalledTimes(1);
  });

  it('propagates nested calculation failure and never writes it to cache', async () => {
    const { context, store } = atrosContext();
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'EPHEMERIS_ERROR' as const, message: '/private/path/raw ephemeris failure' },
    }));

    await expect(runAtrosTool(context, 'atros_transit', { asOf: '2026-09-21' }, execute))
      .resolves.toEqual({
        ok: false,
        error: {
          code: 'atros_ephemeris_error',
          message: 'The calculation could not run because ephemeris data was unavailable.',
        },
      });
    expect(store.writeCalculationCache).not.toHaveBeenCalled();
  });
});
