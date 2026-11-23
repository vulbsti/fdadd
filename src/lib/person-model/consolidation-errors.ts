export const PERSON_LEASE_LOST_CODE = 'PJF01';

export class PersonLeaseLostError extends Error {
  readonly databaseCode = PERSON_LEASE_LOST_CODE;

  constructor() {
    super('Person consolidation lease or fence is no longer current.');
    this.name = 'PersonLeaseLostError';
  }
}

export function isPersonLeaseLostError(error: unknown): boolean {
  return error instanceof PersonLeaseLostError
    || (error instanceof Error
      && 'databaseCode' in error
      && error.databaseCode === PERSON_LEASE_LOST_CODE);
}

export type PersonFailureKind = 'malformed_output' | 'verification_exhausted' | 'quota' | 'timeout' | 'provider' | 'database' | 'unknown';

/**
 * A plain, serializable description of a consolidation failure. Workflow step
 * arguments are serialized, so a thrown error's own fields (code, status) must
 * be read before the error crosses into the step that records it.
 */
export interface PersonFailureDetails {
  code: string;
  kind: PersonFailureKind;
  databaseCode: string | null;
  providerStatus: number | null;
  name: string;
  message: string;
}

export function describePersonFailure(error: unknown): PersonFailureDetails {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown failure.';
  const serializedDatabaseCode = message.match(/storage failed \(([A-Z0-9]+)\)/i)?.[1] ?? null;
  const ownCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
  const rawCode = ownCode ?? (serializedDatabaseCode ? `database_${serializedDatabaseCode.toLowerCase()}` : 'consolidation_failed');
  const code = /^[a-z0-9_.-]{1,80}$/i.test(rawCode) ? rawCode : 'consolidation_failed';
  const databaseCode = error instanceof Error && 'databaseCode' in error && typeof error.databaseCode === 'string'
    ? error.databaseCode.slice(0, 20) : serializedDatabaseCode;
  const providerStatus = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : null;
  const kind: PersonFailureKind = code.startsWith('malformed_stage_') || code.startsWith('explicit_change_') ? 'malformed_output'
    : code === 'verification_exhausted' ? 'verification_exhausted'
      : providerStatus === 429 ? 'quota'
        : providerStatus === 408 || providerStatus === 504 ? 'timeout'
          : providerStatus !== null ? 'provider'
            : databaseCode ? 'database' : 'unknown';
  return {
    code,
    kind,
    databaseCode,
    providerStatus,
    name: error instanceof Error ? error.name.slice(0, 80) : 'Error',
    message: message.slice(0, 500),
  };
}

/**
 * Provider, quota and timeout failures are about the moment, not the input:
 * the next message's job covers the same sources and tries again. Any other
 * failure on the final attempt would fail again for the same input, so those
 * sources are skipped rather than left to block every later update.
 */
export function shouldSkipAfterFinalFailure(failure: PersonFailureDetails): boolean {
  return !['quota', 'timeout', 'provider'].includes(failure.kind);
}
