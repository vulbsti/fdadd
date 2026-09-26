import type { RunVerification } from './contracts';

/** A rejection must identify something retrieval or revision can act on. */
export function verificationNeedsRetry(verdict: RunVerification | null): boolean {
  return verdict === null || (
    verdict.verdict === 'needs_more_evidence' &&
    verdict.unsupportedClaims.length === 0 &&
    verdict.requiredEvidenceIds.length === 0
  );
}

/** Make the independent review actionable for the next answer, not just search. */
export function draftRevisionInstruction(verdict: RunVerification): string {
  return [
    'Revise the rejected draft using this verification feedback.',
    'Remove unsupported claims. Do not repeat them with softer wording or invent evidence for them. A possible explanation is not an established fact about this person.',
    'Keep the supported parts and give a useful response. If the missing information belongs to the user, ask one focused question instead of asserting an explanation.',
    `Verdict: ${verdict.verdict}. Reason: ${verdict.reason}`,
    `Unsupported claims: ${JSON.stringify(verdict.unsupportedClaims)}`,
    `Required evidence: ${JSON.stringify(verdict.requiredEvidenceIds)}`,
  ].join('\n');
}
