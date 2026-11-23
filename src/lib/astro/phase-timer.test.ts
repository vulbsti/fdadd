import { describe, expect, it } from 'vitest';
import { createPhaseTimer } from './phase-timer';

describe('createPhaseTimer', () => {
  it('records sequential marks and overlapping measured work separately', async () => {
    let clock = 1_000;
    const timer = createPhaseTimer(() => clock);
    clock += 50;
    timer.mark('lock');
    await timer.measure('files', async () => { clock += 300; });
    timer.resume();
    clock += 20;
    timer.mark('config');
    expect(timer.result()).toEqual({ lock: 50, files: 300, config: 20, totalMs: 370 });
  });

  it('records a failed phase and rethrows', async () => {
    let clock = 0;
    const timer = createPhaseTimer(() => clock);
    await expect(timer.measure('install', async () => { clock += 5; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(timer.result().install).toBe(5);
  });
});
