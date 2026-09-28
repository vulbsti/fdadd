import { describe, expect, it } from 'vitest';
import {
  parsePersonRunMode,
  PersonRunModeUnavailableError,
  personRunModeFailure,
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

  it('parses a verified preference row', () => {
    expect(parsePersonRunMode({ data: { astrology_enabled: false, mode_epoch: '5' }, error: null }))
      .toEqual({ astrologyEnabled: false, modeEpoch: 5 });
  });

  it('preserves the typed unavailable failure after Workflow serialization', () => {
    expect(personRunModeFailure({ name: 'PersonRunModeUnavailableError' })).toEqual({
      code: 'internal',
      message: 'Person settings could not be verified. The run stopped without using astrology.',
    });
    expect(personRunModeFailure(new Error('other'))).toBeNull();
  });
});
