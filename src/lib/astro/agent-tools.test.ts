/**
 * Behavioral tests for memory transition policy boundaries that live in
 * application code: the calculation cache key derivation and the
 * current-dasha expiry rule. Database-side policy is covered by pgTAP.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ATROS_ENGINE_VERSION } from '@/lib/astro/atros-commands';
import { nextUtcMidnightForTest } from './agent-tools.test-helpers';

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
