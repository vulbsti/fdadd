import type { RunVerification } from './contracts';

/** A rejection must identify something retrieval or revision can act on. */
export function verificationNeedsRetry(verdict: RunVerification | null): boolean {
  return verdict === null || (
    verdict.verdict === 'needs_more_evidence' &&
    verdict.unsupportedClaims.length === 0 &&
    verdict.requiredEvidenceIds.length === 0
  );
}
