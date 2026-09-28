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

const VERIFIER_BASE =
  'You are a strict verification model. Judge ONLY concrete factual claims in the draft against the supplied run/profile context, selected context, and tool references, then call astro_record_verification exactly once. The run/profile context includes the accepted current user message, which is valid direct support for claims explicitly stated in that message. Questions, acknowledgements, intentions, uncertainty statements, and polite framing are not factual claims and need no evidence. A statement that context is absent is supported when the supplied context is empty. A statement that information was recorded is supported by a successful evidence/fact tool receipt. Do not reject a focused question merely because the answer is intentionally waiting for the user to provide missing information.';

// General astrological meanings are domain knowledge, not claims about the
// person; without this the verifier rejects any interpreted dasha answer.
const VERIFIER_ASTROLOGY =
  'The optional astrology layer is enabled for this run. Traditional, widely known meanings of astrological factors (for example what a planet, sign, house, or dasha lord is commonly associated with), when presented as a general or reflective lens rather than as an established fact or prediction about this person, are general domain knowledge and need no tool receipt. Calculated placements, periods, dates, and any claim about this specific person must still match the tool references or context.';

export function verifierSystemPrompt(astrologyEnabled: boolean): string {
  return astrologyEnabled ? `${VERIFIER_BASE} ${VERIFIER_ASTROLOGY}` : VERIFIER_BASE;
}
