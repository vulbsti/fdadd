import { describe, expect, it } from 'vitest';
import {
  PersonIdentitySchema,
  PersonObjectPayloadSchema,
  PersonRelationKindSchema,
  PublishPersonRevisionInputSchema,
  type PersonObjectKind,
} from './contracts';

const timeUnknown = { precision: 'unknown', start: null, end: null, age: null, note: null } as const;

const payloads: Record<PersonObjectKind, unknown> = {
  episode: {
    kind: 'episode', title: 'A move', event: 'Moved to a new city', setting: null, people: [],
    reportedExperience: null, reportedEffects: [], unresolvedInterpretation: null, occurred: timeUnknown,
  },
  meaning_change: {
    kind: 'meaning_change', title: 'Meaning is unresolved', priorMeaning: 'I expected X',
    challengingExperience: 'The experience differed', laterMeaning: null, laterMeaningStatus: 'unknown', effectivePeriod: timeUnknown,
  },
  pattern: {
    kind: 'pattern', title: 'A possible pattern', triggerOrContext: 'When plans change', expectationOrAttention: null,
    response: 'I pause', reportedConsequence: null, supportingEpisodeIds: [], exceptions: [], alternativeExplanations: [], scope: null, observedDuring: timeUnknown,
  },
  influence: {
    kind: 'influence', title: 'A relationship', subjectPersonId: null, entityAsDescribed: 'A friend',
    relationshipLabelAsReported: null, experiencedInfluence: 'Their support mattered', connectedEpisodeIds: [],
  },
  goal: {
    kind: 'goal', title: 'Learn a skill', statedOutcome: 'Learn a skill', underlyingValue: null,
    status: 'active', timeframe: timeUnknown, purpose: null,
  },
  issue: {
    kind: 'issue', title: 'An open issue', presentRelevance: 'Still relevant', constraints: [], unresolvedQuestions: [], status: 'active', framing: 'reported',
  },
  current_state: {
    kind: 'current_state', title: 'Current work', domain: 'work', summary: 'Exploring options',
    asOf: '2026-09-22T10:00:00Z', freshness: 'current', openChecks: [],
  },
  gap: {
    kind: 'gap', title: 'Timing is unclear', distinction: 'Before or after the move', whyItMatters: 'Changes the chronology',
    blockedInterpretationOrDecision: null, candidateQuestion: null, status: 'open',
  },
  scenario: {
    kind: 'scenario', title: 'A possible next step', currentState: 'Considering options', goalIds: [], conditions: [],
    possibleDevelopment: 'Could try a small experiment', counterconditions: ['If time is unavailable'], observableSigns: ['A first attempt'],
    uncertainty: 'This is conditional, not a forecast', horizon: timeUnknown,
  },
  chapter: {
    kind: 'chapter', title: 'A transition', memberObjectIds: ['11111111-1111-4111-8111-111111111111'], theme: 'Trying a new direction', unresolvedQuestions: [],
  },
};

describe('person-model contracts', () => {
  it.each(Object.entries(payloads))('validates %s as a discriminated payload', (_kind, payload) => {
    expect(PersonObjectPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('keeps unknown meaning explicitly empty instead of manufacturing a change', () => {
    const result = PersonObjectPayloadSchema.safeParse({
      ...(payloads.meaning_change as Record<string, unknown>),
      laterMeaning: 'They became more confident',
    });
    expect(result.success).toBe(false);
  });

  it('accepts name-only readiness independently of astrology setup', () => {
    const personId = '11111111-1111-4111-8111-111111111111';
    const identity = PersonIdentitySchema.parse({
      personId,
      ownerId: '22222222-2222-4222-8222-222222222222',
      name: 'Sam',
      personStatus: 'active',
      astroStatus: 'not_configured',
      readiness: {
        person: 'ready', astrology: 'not_configured', level: 'name_only',
        explanation: 'Ready without birth details.',
      },
      createdAt: '2026-09-22T10:00:00Z',
      updatedAt: '2026-09-22T10:00:00Z',
    });
    expect(identity.personId).toBe(personId);
    expect(identity.readiness.level).toBe('name_only');
  });

  it('validates the revision membership payload accepted by the fenced SQL publisher', () => {
    const result = PublishPersonRevisionInputSchema.safeParse({
      personId: '11111111-1111-4111-8111-111111111111',
      jobId: '22222222-2222-4222-8222-222222222222',
      leaseToken: '33333333-3333-4333-8333-333333333333',
      fence: 1,
      expectedBaseRevision: 1,
      expectedPrivacyEpoch: 0,
      commitId: '44444444-4444-4444-8444-444444444444',
      candidate: {
        processedSourceSeq: 0,
        objectMembers: [
          { objectId: '55555555-5555-4555-8555-555555555555', versionId: '66666666-6666-4666-8666-666666666666' },
          { objectId: '77777777-7777-4777-8777-777777777777', versionId: '88888888-8888-4888-8888-888888888888' },
        ],
        relationMembers: [{ relationId: '99999999-9999-4999-8999-999999999999', versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
        conflictIds: [],
        resolveChangeIds: [],
        brief: '',
        changedIds: [],
        decisionSummary: '',
        verifierReceipt: {},
        viewSnapshots: [{
          viewKey: 'life_map',
          snapshot: {
            personRevision: 2,
            sourceWatermark: 0,
            mode: 'personal',
            modeEpoch: 0,
            privacyEpoch: 0,
            updateState: 'current',
            view: 'life_map',
            objectId: null,
            title: 'Life map',
            nodes: [],
            edges: [],
            explorationIds: [],
            generatedAt: '2026-09-22T10:00:00Z',
          },
        }],
      },
    });
    expect(result.success).toBe(true);
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

  it('exposes the complete relation vocabulary', () => {
    expect(PersonRelationKindSchema.options).toEqual([
      'precedes', 'reported_effect', 'changed_meaning', 'supports', 'qualifies',
      'contradicts', 'influenced', 'part_of', 'hypothesized_link',
    ]);
  });
});
