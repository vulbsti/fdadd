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
