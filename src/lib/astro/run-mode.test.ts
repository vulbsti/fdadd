import { describe, expect, it, vi } from 'vitest';
import {
  parsePersonRunMode,
  atrosToolsAllowed,
  filterAtrosTools,
  PersonRunModeChangedError,
  PersonRunModeUnavailableError,
  personRunModeFailure,
  withAtrosConsent,
  withStablePersonRunMode,
} from './run-mode';

describe('person run mode fence', () => {
  it('fails closed when the preference read errors or is incomplete', () => {
    expect(() => parsePersonRunMode({ data: null, error: new Error('database unavailable') }))
      .toThrow(PersonRunModeUnavailableError);
    expect(() => parsePersonRunMode({ data: { astrology_enabled: true }, error: null }))
      .toThrow(PersonRunModeUnavailableError);
    expect(() => parsePersonRunMode({
      data: { astrology_enabled: true, mode_epoch: null },
      error: null,
    })).toThrow(PersonRunModeUnavailableError);
  });

  it('does not call the provider when preference verification errors', async () => {
    const provider = vi.fn(async () => 'response');
    await expect(withStablePersonRunMode(
      0,
      async () => parsePersonRunMode({ data: null, error: new Error('database unavailable') }),
      provider,
    )).rejects.toBeInstanceOf(PersonRunModeUnavailableError);
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not make an external call when the current mode epoch changed', async () => {
    const call = vi.fn(async () => 'should not run');
    await expect(withStablePersonRunMode(
      4,
      async () => ({ astrologyEnabled: false, modeEpoch: 5 }),
      call,
    )).rejects.toBeInstanceOf(PersonRunModeChangedError);
    expect(call).not.toHaveBeenCalled();
  });

  it('does not call Atros when astrology is off or birth inputs are incomplete', async () => {
    const call = vi.fn(async () => 'chart result');
    const personalMode = { astrologyEnabled: false, modeEpoch: 5 };
    const enabledMode = { astrologyEnabled: true, modeEpoch: 5 };

    expect(atrosToolsAllowed(personalMode, true)).toBe(false);
    expect(atrosToolsAllowed(enabledMode, false)).toBe(false);
    await expect(withAtrosConsent(personalMode, true, call)).resolves.toEqual({ executed: false });
    await expect(withAtrosConsent(enabledMode, false, call)).resolves.toEqual({ executed: false });
    expect(call).not.toHaveBeenCalled();
  });

  it('removes Atros from the provider-visible tools in personal-only mode', () => {
    const tools = [
      { function: { name: 'astro_finish_run' } },
      { function: { name: 'atros_chart' } },
      { function: { name: 'atros_current_dasha' } },
    ];
    expect(filterAtrosTools(tools, { astrologyEnabled: false, modeEpoch: 2 }, true))
      .toEqual([tools[0]]);
    expect(filterAtrosTools(tools, { astrologyEnabled: true, modeEpoch: 2 }, false))
      .toEqual([tools[0]]);
  });

  it('passes the freshly verified disabled mode to the boundary at the same epoch', async () => {
    const call = vi.fn(async (mode) => mode.astrologyEnabled);
    await expect(withStablePersonRunMode(
      5,
      async () => parsePersonRunMode({
        data: { astrology_enabled: false, mode_epoch: 5 },
        error: null,
      }),
      call,
    )).resolves.toBe(false);
    expect(call).toHaveBeenCalledWith({ astrologyEnabled: false, modeEpoch: 5 });
  });

  it('preserves typed stale and unavailable failures after Workflow serialization', () => {
    expect(personRunModeFailure({ name: 'PersonRunModeChangedError' })).toEqual({
      code: 'stale_version',
      message: 'Person settings changed during this run. Start a new run with the current settings.',
    });
    expect(personRunModeFailure({ name: 'PersonRunModeUnavailableError' })?.code).toBe('internal');
  });
});
