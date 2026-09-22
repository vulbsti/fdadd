import { describe, expect, it } from 'vitest';
import { parsePersonReadProjection } from './projection-contract';

const validProjection = {
  personId: '11111111-1111-4111-8111-111111111111',
  personRevision: 2,
  sourceWatermark: 3,
  mode: 'personal',
  modeEpoch: 4,
  privacyEpoch: 5,
  generatedAt: '2026-09-22T10:00:00+00:00',
  updateState: 'current',
  objects: [{
    object_id: '22222222-2222-4222-8222-222222222222',
    kind: 'episode',
    version_id: '33333333-3333-4333-8333-333333333333',
    version_no: 1,
    epistemic_class: 'reported',
    lifecycle: 'active',
    typed_payload: { title: 'A supported event' },
    effective_from: null,
    effective_to: null,
  }],
  relations: [],
  supportCount: 1,
};

describe('parsePersonReadProjection', () => {
  it('accepts an exact projection response', () => {
    expect(parsePersonReadProjection(validProjection)).toEqual(validProjection);
  });

  it.each([
    ['missing person id', { ...validProjection, personId: undefined }],
    ['unknown mode', { ...validProjection, mode: 'hybrid' }],
    ['non-numeric revision', { ...validProjection, personRevision: '2' }],
    ['unknown update state', { ...validProjection, updateState: 'ready' }],
    ['malformed object identity', { ...validProjection, objects: [{ ...validProjection.objects[0], object_id: null }] }],
  ])('rejects %s instead of coercing it', (_label, projection) => {
    expect(() => parsePersonReadProjection(projection)).toThrow();
  });
});
