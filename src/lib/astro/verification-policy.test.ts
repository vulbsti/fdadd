import { describe, expect, it } from 'vitest';
import { draftRevisionInstruction, verificationNeedsRetry } from './verification-policy';

it('passes rejected claims and required evidence to the revising model without treating hypotheses as facts', () => {
  const instruction = draftRevisionInstruction({
    verdict: 'needs_more_evidence',
    unsupportedClaims: ['Asking for help makes the user feel exposed.'],
    requiredEvidenceIds: ['source-123'],
    reason: 'The user reported a should-belief, not that emotion.',
  });
  expect(instruction).toContain('Asking for help makes the user feel exposed.');
  expect(instruction).toContain('source-123');
  expect(instruction).toContain('Remove unsupported claims');
  expect(instruction).toContain('ask one focused question');
});

describe('verificationNeedsRetry', () => {
  it('retries a needs-more verdict that names no retrievable gap', () => {
    expect(verificationNeedsRetry({
      verdict: 'needs_more_evidence',
      unsupportedClaims: [],
      requiredEvidenceIds: [],
      reason: 'more evidence needed',
    })).toBe(true);
  });

  it('preserves an actionable evidence gap', () => {
    expect(verificationNeedsRetry({
      verdict: 'needs_more_evidence',
      unsupportedClaims: ['The user has a launch date.'],
      requiredEvidenceIds: [],
      reason: 'No source supports the date.',
    })).toBe(false);
  });

  it('does not relax a contradiction', () => {
    expect(verificationNeedsRetry({
      verdict: 'contradicted',
      unsupportedClaims: [],
      requiredEvidenceIds: [],
      reason: 'The source says the opposite.',
    })).toBe(false);
  });

  it('retries an unparseable verifier response', () => {
    expect(verificationNeedsRetry(null)).toBe(true);
  });
});
