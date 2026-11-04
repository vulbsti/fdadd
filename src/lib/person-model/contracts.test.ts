import { describe, expect, it } from 'vitest';
import {
  PersonChangeCommandSchema,
  PersonObjectPayloadSchema,
  PublishPersonRevisionInputSchema,
  personChangeRequestFromCommand,
} from './contracts';

const unknownMeaning = {
  kind: 'meaning_change', title: 'Meaning is unresolved', priorMeaning: 'I expected X',
  challengingExperience: 'The experience differed', laterMeaning: null, laterMeaningStatus: 'unknown',
  effectivePeriod: { precision: 'unknown', start: null, end: null, age: null, note: null },
};

describe('person-model contracts', () => {
  it('keeps unknown meaning explicitly empty instead of manufacturing a change', () => {
    expect(PersonObjectPayloadSchema.safeParse(unknownMeaning).success).toBe(true);
    const result = PersonObjectPayloadSchema.safeParse({
      ...unknownMeaning,
      laterMeaning: 'They became more confident',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes the browser correction command into the exact durable intent payload', () => {
    const command = PersonChangeCommandSchema.parse({
      kind: 'correct_account',
      clientCommandId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 2,
      targetId: '22222222-2222-4222-8222-222222222222',
      account: { correction: 'The job change happened in 2025, not 2024.' },
    });

    expect(personChangeRequestFromCommand(command)).toEqual({
      kind: 'correct_account',
      targetObjectId: '22222222-2222-4222-8222-222222222222',
      payload: { correction: 'The job change happened in 2025, not 2024.' },
    });
  });

  it('normalizes a bare rejection into an explicit durable explanation', () => {
    const command = PersonChangeCommandSchema.parse({
      kind: 'reject_interpretation',
      clientCommandId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 2,
      targetId: '22222222-2222-4222-8222-222222222222',
    });

    expect(personChangeRequestFromCommand(command)).toEqual({
      kind: 'reject_interpretation',
      targetObjectId: '22222222-2222-4222-8222-222222222222',
      explanation: 'This interpretation does not fit me.',
    });
  });

  it('rejects duplicate or revision-mismatched view snapshots in one publication', async () => {
    const valid = {
      personRevision: 2,
      sourceWatermark: 1,
      mode: 'personal',
      modeEpoch: 3,
      privacyEpoch: 0,
      updateState: 'current',
      view: 'life_map',
      objectId: null,
      title: 'Life map',
      nodes: [],
      edges: [],
      explorationIds: [],
      generatedAt: '2026-09-22T10:00:00Z',
    };
    const input = {
      personId: '11111111-1111-4111-8111-111111111111',
      jobId: '22222222-2222-4222-8222-222222222222',
      leaseToken: '33333333-3333-4333-8333-333333333333',
      fence: 1,
      expectedBaseRevision: 1,
      expectedPrivacyEpoch: 0,
      commitId: '44444444-4444-4444-8444-444444444444',
      candidate: {
        processedSourceSeq: 1,
        objectMembers: [],
        relationMembers: [],
        conflictIds: [],
        resolveChangeIds: [],
        brief: '',
        changedIds: [],
        decisionSummary: '',
        verifierReceipt: {},
        viewSnapshots: [
          { viewKey: 'life_map', snapshot: valid },
          { viewKey: 'life_map', snapshot: valid },
        ],
      },
    };
    expect(PublishPersonRevisionInputSchema.safeParse(input).success).toBe(false);
    expect(PublishPersonRevisionInputSchema.safeParse({
      ...input,
      candidate: { ...input.candidate, viewSnapshots: [{ viewKey: 'life_map', snapshot: { ...valid, personRevision: 3 } }] },
    }).success).toBe(false);
  });
});
