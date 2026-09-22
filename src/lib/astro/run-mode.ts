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

export class PersonRunModeChangedError extends Error {
  readonly code: AgentErrorCode = 'stale_version';

  constructor() {
    super('Person settings changed during this run. Start a new run with the current settings.');
    this.name = 'PersonRunModeChangedError';
  }
}

export function personRunModeFailure(error: unknown): {
  code: AgentErrorCode;
  message: string;
} | null {
  const name = error && typeof error === 'object' && 'name' in error
    ? (error as { name?: unknown }).name
    : null;
  if (error instanceof PersonRunModeChangedError || name === 'PersonRunModeChangedError') {
    return {
      code: 'stale_version',
      message: 'Person settings changed during this run. Start a new run with the current settings.',
    };
  }
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

/** Run an external boundary only while its consent epoch still matches. */
export async function withStablePersonRunMode<T>(
  expectedModeEpoch: number,
  readMode: () => Promise<PersonRunMode>,
  externalCall: (mode: PersonRunMode) => Promise<T>,
): Promise<T> {
  const mode = await readMode();
  if (mode.modeEpoch !== expectedModeEpoch) throw new PersonRunModeChangedError();
  return externalCall(mode);
}

export function atrosToolsAllowed(mode: PersonRunMode, hasBirthData: boolean): boolean {
  return mode.astrologyEnabled && hasBirthData;
}

export function filterAtrosTools<T extends { function: { name: string } }>(
  tools: T[],
  mode: PersonRunMode,
  hasBirthData: boolean,
): T[] {
  return atrosToolsAllowed(mode, hasBirthData)
    ? tools
    : tools.filter((tool) => !tool.function.name.startsWith('atros_'));
}

export async function withAtrosConsent<T>(
  mode: PersonRunMode,
  hasBirthData: boolean,
  call: () => Promise<T>,
): Promise<{ executed: true; value: T } | { executed: false }> {
  if (!atrosToolsAllowed(mode, hasBirthData)) return { executed: false };
  return { executed: true, value: await call() };
}
