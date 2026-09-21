import { describe, expect, it } from 'vitest';
import { verificationNeedsRetry } from './verification-policy';

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
