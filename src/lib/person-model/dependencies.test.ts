import { describe, expect, it } from 'vitest';
import { validatePersonDependencies } from './dependencies';

describe('validatePersonDependencies', () => {
  const context = {
    available: {
      source: new Set(['source-a']),
      object_version: new Set(['object-v1']),
    },
    currentVersions: { object_version: new Map([['object-v1', 2]]) },
    excludedSourceIds: new Set(['source-excluded']),
    currentModeEpoch: 3,
    currentPrivacyEpoch: 5,
  };

  it('accepts present, eligible records at current epochs', () => {
    const result = validatePersonDependencies([
      { kind: 'source', id: 'source-a', version: null },
      { kind: 'object_version', id: 'object-v1', version: 2 },
      { kind: 'mode_epoch', id: 'person', version: 3 },
      { kind: 'privacy_epoch', id: 'person', version: 5 },
    ], context);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects excluded sources and missing or stale dependencies', () => {
    const result = validatePersonDependencies([
      { kind: 'source', id: 'source-excluded', version: null },
      { kind: 'observation', id: 'missing-observation', version: null },
      { kind: 'object_version', id: 'object-v1', version: 1 },
      { kind: 'mode_epoch', id: 'person', version: 2 },
      { kind: 'privacy_epoch', id: 'person', version: 4 },
    ], context);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'excluded_source', 'missing_dependency', 'stale_dependency', 'stale_dependency', 'stale_dependency',
    ]);
  });

  it('rejects malformed and repeated dependencies without dropping parsed entries', () => {
    const result = validatePersonDependencies([
      { kind: 'source', id: 'source-a', version: null },
      { kind: 'source', id: 'source-a', version: null },
      { kind: 'source', id: '', version: null },
    ], context);
    expect(result.valid).toBe(false);
    expect(result.dependencies).toHaveLength(2);
    expect(result.issues.map((issue) => issue.code)).toEqual(['duplicate_dependency', 'invalid_dependency']);
  });
});
