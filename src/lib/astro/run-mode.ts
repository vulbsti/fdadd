import type { AgentErrorCode } from './contracts';

export interface PersonRunMode {
  astrologyEnabled: boolean;
  modeEpoch: number;
}

export class PersonRunModeUnavailableError extends Error {
  readonly code: AgentErrorCode = 'internal';

  constructor() {
    super('Person settings could not be verified. The run stopped without using astrology.');
    this.name = 'PersonRunModeUnavailableError';
  }
}

export function personRunModeFailure(error: unknown): {
  code: AgentErrorCode;
  message: string;
} | null {
  const name = error && typeof error === 'object' && 'name' in error
    ? (error as { name?: unknown }).name
    : null;
  if (error instanceof PersonRunModeUnavailableError || name === 'PersonRunModeUnavailableError') {
    return {
      code: 'internal',
      message: 'Person settings could not be verified. The run stopped without using astrology.',
    };
  }
  return null;
}

/** Fail closed: missing, malformed, or errored preference reads are not consent. */
export function parsePersonRunMode(result: {
  data: unknown;
  error: unknown;
}): PersonRunMode {
  if (result.error || !result.data || typeof result.data !== 'object') {
    throw new PersonRunModeUnavailableError();
  }

  const row = result.data as Record<string, unknown>;
  const rawModeEpoch = row.mode_epoch;
  const modeEpoch = typeof rawModeEpoch === 'number'
    ? rawModeEpoch
    : typeof rawModeEpoch === 'string' && /^\d+$/.test(rawModeEpoch)
      ? Number(rawModeEpoch)
      : Number.NaN;
  if (
    typeof row.astrology_enabled !== 'boolean' ||
    !Number.isSafeInteger(modeEpoch) ||
    modeEpoch < 0
  ) {
    throw new PersonRunModeUnavailableError();
  }

  return { astrologyEnabled: row.astrology_enabled, modeEpoch };
}
