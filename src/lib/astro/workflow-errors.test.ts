import { describe, expect, it } from 'vitest';
import { getErrorMessage, isMissingAtrosAssetError } from './workflow-errors';

describe('workflow error normalization', () => {
  it('keeps native error messages', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('keeps Workflow-serialized error messages', () => {
    expect(getErrorMessage({ name: 'Error', message: 'serialized boom' })).toBe('serialized boom');
    expect(getErrorMessage({ error: { message: 'nested boom' } })).toBe('nested boom');
  });

  it('detects the missing vendored Atros asset', () => {
    expect(
      isMissingAtrosAssetError(
        new Error("ENOENT: no such file or directory, scandir '/var/task/vendor/atros'"),
      ),
    ).toBe(true);
    expect(isMissingAtrosAssetError(new Error('atros warmup failed'))).toBe(false);
  });
});
