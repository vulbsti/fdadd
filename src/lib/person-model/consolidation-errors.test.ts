import { describe, expect, it } from 'vitest';
import { describePersonFailure, shouldSkipAfterFinalFailure } from './consolidation-errors';
import { MalformedPersonStageOutputError } from './consolidation';

describe('describePersonFailure', () => {
  it('keeps the code and message of a malformed stage output', () => {
    const failure = describePersonFailure(new MalformedPersonStageOutputError('Verifier accepted an unknown composition item.'));
    expect(failure).toMatchObject({ code: 'malformed_stage_output', kind: 'malformed_output',
      message: 'Verifier accepted an unknown composition item.' });
    expect(shouldSkipAfterFinalFailure(failure)).toBe(true);
  });

  it('reads the database code from a storage failure', () => {
    const failure = describePersonFailure(new Error('Person consolidation storage failed (PSQ01): candidate source watermark is not contiguous'));
    expect(failure).toMatchObject({ code: 'database_psq01', kind: 'database', databaseCode: 'PSQ01' });
    expect(failure.message).toContain('not contiguous');
  });

  it('does not skip input when the provider was the problem', () => {
    const quota = Object.assign(new Error('Provider returned 429.'), { status: 429 });
    const down = Object.assign(new Error('Provider returned 502.'), { status: 502 });
    expect(describePersonFailure(quota).kind).toBe('quota');
    expect(shouldSkipAfterFinalFailure(describePersonFailure(quota))).toBe(false);
    expect(shouldSkipAfterFinalFailure(describePersonFailure(down))).toBe(false);
  });

  it('describes errors without a code and non-errors', () => {
    expect(describePersonFailure(new Error('x'.repeat(900)))).toMatchObject({ code: 'consolidation_failed', kind: 'unknown' });
    expect(describePersonFailure(new Error('x'.repeat(900))).message).toHaveLength(500);
    expect(describePersonFailure('boom')).toMatchObject({ code: 'consolidation_failed', message: 'boom' });
  });
});
