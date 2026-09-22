import { describe, expect, it } from 'vitest';
import {
  callPersonStage,
  coldStartMatchAndReconciliation,
  MalformedPersonStageOutputError,
  PersonCompositionPlanSchema,
  PersonExtractionOutputSchema,
  PersonReconciliationOutputSchema,
  materializeConsolidationCandidate,
  normalizeObservationSpans,
  personStageToolParameters,
  validateCountercontextCoverage,
  validateObservationSpans,
  verifiedCompositionSubset,
  type ConsolidationSource,
  type CountercontextItem,
} from './consolidation';
import { PersonObservationDraftSchema } from './contracts';
import type { ChatCompletionOptions, ChatCompletionResult } from '@/lib/ai/provider';

const ids = {
  source: '11111111-1111-4111-8111-111111111111',
  otherSource: '22222222-2222-4222-8222-222222222222',
  observation: '33333333-3333-4333-8333-333333333333',
  person: '44444444-4444-4444-8444-444444444444',
  object: '55555555-5555-4555-8555-555555555555',
};
const unknownTime = { precision: 'unknown', start: null, end: null, age: null, note: null } as const;

function providerResult(name: string, argumentsText: string): ChatCompletionResult {
  return {
    provider: 'fake',
    model: 'fixture-model',
    choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: argumentsText } }] } }],
  };
}

function makeSource(overrides: Partial<ConsolidationSource> = {}): ConsolidationSource {
  return {
    sourceId: ids.source,
    sourceSeq: 1,
    sourceTime: '2026-09-22T10:00:00Z',
    ingestedAt: '2026-09-22T10:00:01Z',
    sourceKind: 'native_message',
    speaker: 'user',
    subjectKind: 'self',
    subjectLabel: null,
    inclusion: 'included',
    body: 'My parent moved. I moved.',
    ...overrides,
  };
}

function makeObservation(subjectKind: 'self' | 'other' | 'hypothetical' | 'unknown' = 'unknown') {
  return PersonObservationDraftSchema.parse({
    sourceId: ids.source,
    spanStart: 0,
    spanEnd: 15,
    exactQuote: 'My parent moved',
    normalizedAssertion: 'The parent moved.',
    subjectKind,
    subjectLabel: subjectKind === 'other' ? 'parent' : null,
    subjectPersonId: null,
    domain: 'family',
    assertionType: 'direct',
    eventTime: unknownTime,
    extractorVersion: 'test-extractor-v1',
    verifierVersion: null,
  });
}

function makePlan() {
  return PersonCompositionPlanSchema.parse({
    objects: [
      {
        key: 'meaning-1',
        existingObjectId: ids.object,
        payload: {
          kind: 'meaning_change', title: 'Meaning remains open', priorMeaning: 'I expected certainty.',
          challengingExperience: 'The work raised a different question.', laterMeaning: null,
          laterMeaningStatus: 'not_yet_shared', effectivePeriod: unknownTime,
        },
        epistemicClass: 'reported', lifecycle: 'active', effectiveTime: unknownTime,
        sourceIds: [ids.source], observationIndexes: [0],
      },
      {
        key: 'pattern-1',
        existingObjectId: null,
        payload: {
          kind: 'pattern', title: 'A qualified pattern', triggerOrContext: 'During uncertainty',
          expectationOrAttention: null, response: 'I pause', reportedConsequence: null,
          supportingEpisodeIds: [], exceptions: ['A later day alone was productive.'],
          alternativeExplanations: ['The amount of rest may matter.'], scope: 'Some periods', observedDuring: unknownTime,
        },
        epistemicClass: 'working_hypothesis', lifecycle: 'active', effectiveTime: unknownTime,
        sourceIds: [ids.otherSource], observationIndexes: [1],
      },
    ],
    relations: [],
    brief: 'A brief with an unresolved later meaning.',
    decisionSummary: 'Preserved the open question.',
    changedKeys: ['meaning-1', 'pattern-1'],
    unresolvedQuestions: [],
  });
}

describe('person consolidation stage contracts', () => {
  it('accepts exactly one expected typed provider tool result and records provider metadata', async () => {
    const call = async (options: ChatCompletionOptions) => {
      expect(options.toolChoice).toEqual({ name: 'person_extract' });
      return providerResult('person_extract', JSON.stringify({ observations: [], unknowns: [] }));
    };
    const response = await callPersonStage<typeof PersonExtractionOutputSchema._type>({
      stage: 'extract', toolName: 'person_extract', description: 'Return observations.',
      parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
      system: 'System rules.', content: 'Untrusted source.', providerCall: call,
    });
    expect(response.value).toEqual({ observations: [], unknowns: [] });
    expect(response.metadata).toEqual({ provider: 'fake', model: 'fixture-model' });
  });

  it('accepts a whole strict JSON response when Go auto mode omits the tool call', async () => {
    const result = await callPersonStage<typeof PersonExtractionOutputSchema._type>({
      stage: 'extract', toolName: 'person_extract', description: 'Return observations.',
      parameters: {}, system: 'System rules.', content: 'Untrusted source.',
      providerCall: async () => ({
        provider: 'fake', model: 'fixture-model',
        choices: [{ message: { content: '```json\n{"observations":[],"unknowns":[]}\n```', tool_calls: [] } }],
      }),
    });
    expect(result.value).toEqual({ observations: [], unknowns: [] });
  });

  it('uses the generated schema in JSON-only mode without sending provider tools', async () => {
    const result = await callPersonStage<typeof PersonExtractionOutputSchema._type>({
      stage: 'extract', toolName: 'person_extract', description: 'Return observations.',
      parameters: { type: 'object', marker: 'strict-stage-schema' },
      system: 'System rules.', content: '{"sources":[]}', responseMode: 'json',
      providerCall: async (options) => {
        expect(options.tools).toBeUndefined();
        expect(options.toolChoice).toBeUndefined();
        expect(options.messages[0]?.content).toContain('exactly one JSON object');
        expect(options.messages[1]?.content).toContain('strict-stage-schema');
        return {
          provider: 'fake', model: 'fixture-model',
          choices: [{ message: { content: '{"observations":[],"unknowns":[]}', tool_calls: [] } }],
        };
      },
    });
    expect(result.value).toEqual({ observations: [], unknowns: [] });
  });

  it('rejects wrong tool name, malformed JSON, and schema-invalid provider output', async () => {
    const base = {
      stage: 'extract' as const, toolName: 'person_extract', description: 'Return observations.',
      parameters: {}, system: 'System rules.', content: 'Untrusted source.',
    };
    await expect(callPersonStage({ ...base, providerCall: async () => providerResult('other_tool', '{}') }))
      .rejects.toBeInstanceOf(MalformedPersonStageOutputError);
    await expect(callPersonStage({ ...base, providerCall: async () => providerResult('person_extract', '{') }))
      .rejects.toBeInstanceOf(MalformedPersonStageOutputError);
    await expect(callPersonStage({ ...base, providerCall: async () => providerResult('person_extract', '{"unexpected":true}') }))
      .rejects.toBeInstanceOf(MalformedPersonStageOutputError);
  });

  it('gives the provider the full strict stage schema instead of untyped object arrays', () => {
    const extraction = personStageToolParameters('extract') as any;
    expect(extraction.additionalProperties).toBe(false);
    expect(extraction.properties.observations.items.properties.subjectKind.enum)
      .toEqual(['self', 'other', 'hypothetical', 'unknown']);
    expect(extraction.properties.observations.items.properties.exactQuote.anyOf[0].type).toBe('string');
    const repair = personStageToolParameters('repair') as any;
    expect(repair.properties.objects.items.properties.lifecycle.enum)
      .toEqual(['active', 'superseded', 'retired', 'invalidated']);
  });

  it.each(['unknown', 'hypothetical', 'other'] as const)(
    'retains %s attribution explicitly instead of turning absent subject IDs into self', (subjectKind) => {
      const parsed = makeObservation(subjectKind);
      expect(parsed.subjectKind).toBe(subjectKind);
      expect(parsed.subjectPersonId).toBeNull();
    },
  );

  it('requires exact source-backed quote spans and rejects quote laundering', () => {
    const source = makeSource();
    const observation = { ...makeObservation('other'), exactQuote: 'My parent moved.' };
    expect(() => validateObservationSpans([source], [observation])).toThrow(/did not match/);
    const exact = { ...observation, spanStart: 0, spanEnd: 15, exactQuote: 'My parent moved' };
    expect(() => validateObservationSpans([source], [exact])).not.toThrow();
    expect(() => validateObservationSpans([makeSource({ body: 'Different source.' })], [exact])).toThrow(/did not match/);
  });

  it('repairs only uniquely resolvable provider offset drift', () => {
    const source = makeSource({ body: 'First sentence. Exact evidence. Last sentence.' });
    const drifted = {
      ...makeObservation('self'),
      spanStart: 15,
      spanEnd: 29,
      exactQuote: 'Exact evidence.',
    };
    const [normalized] = normalizeObservationSpans([source], [drifted]);
    expect(normalized).toMatchObject({ spanStart: 16, spanEnd: 31, exactQuote: 'Exact evidence.' });
    expect(() => validateObservationSpans([source], [normalized!])).not.toThrow();

    const repeated = makeSource({ body: 'Same quote. Same quote.' });
    expect(() => normalizeObservationSpans([repeated], [{
      ...drifted,
      spanStart: 1,
      spanEnd: 11,
      exactQuote: 'Same quote.',
    }])).toThrow(/uniquely match/);
  });

  it('requires explicit disposition of retrieved counterexamples and preserves qualification', () => {
    const counter: CountercontextItem[] = [{
      observationId: ids.observation, sourceId: ids.otherSource, subjectKind: 'self',
      assertionType: 'direct', status: 'verified', assertion: 'A solo day was productive.', eventTime: unknownTime,
    }];
    const incomplete = PersonReconciliationOutputSchema.parse({ decisions: [{
      observationIndex: 0, disposition: 'new', rationale: 'A pattern was reported.', counterevidence: [],
    }], unresolvedQuestions: [] });
    expect(() => validateCountercontextCoverage(counter, incomplete)).toThrow(/explicitly assess/);
    const qualified = PersonReconciliationOutputSchema.parse({ decisions: [{
      observationIndex: 0,
      disposition: 'context_qualification',
      rationale: 'The reported experience varies with context.',
      counterevidence: [{ observationId: ids.observation, impact: 'qualifies', rationale: 'Productive solitude is an exception.' }],
    }], unresolvedQuestions: [], });
    expect(() => validateCountercontextCoverage(counter, qualified)).not.toThrow();
    expect(qualified.decisions[0].counterevidence[0]?.impact).toBe('qualifies');
  });

  it('uses complete deterministic match and reconciliation outputs for a cold start', () => {
    const coldStart = coldStartMatchAndReconciliation(3);
    expect(coldStart.match.matches.map((item) => item.observationIndex)).toEqual([0, 1, 2]);
    expect(coldStart.match.matches.every((item) => item.matchKind === 'no_match')).toBe(true);
    expect(coldStart.reconciliation.decisions.map((item) => item.disposition)).toEqual(['new', 'new', 'new']);
  });

  it('does not allow an unshared later meaning to be invented and publishes only verified items', () => {
    const plan = makePlan();
    const invalidMeaning = PersonCompositionPlanSchema.safeParse({
      ...plan,
      objects: [{ ...plan.objects[0]!, payload: { ...plan.objects[0]!.payload, laterMeaning: 'They became more confident.' } }],
    });
    expect(invalidMeaning.success).toBe(false);

    const result = verifiedCompositionSubset(plan, {
      findings: [{
        itemKey: 'meaning-1', fieldPath: 'payload.laterMeaning', code: 'invented_unknown', severity: 'blocking',
        explanation: 'No later meaning was provided.', sourceIds: [ids.source], observationIds: [ids.observation],
      }],
      acceptedItemKeys: ['meaning-1', 'pattern-1'],
      unresolvedQuestions: ['What changed in the later period?'],
    });
    expect(result.objects.map((object) => object.key)).toEqual(['pattern-1']);
    expect(result.unresolvedQuestions).toContain('What changed in the later period?');
    expect(result.brief).toBe('');
  });

  it('uses DB-compatible lifecycles and links staged evidence to its observation UUID', () => {
    const plan = PersonCompositionPlanSchema.parse({
      ...makePlan(),
      objects: [makePlan().objects[0]],
      changedKeys: ['meaning-1'],
    });
    expect(PersonCompositionPlanSchema.safeParse({
      ...plan,
      objects: [{ ...plan.objects[0], lifecycle: 'rejected' }],
    }).success).toBe(false);

    const candidate = materializeConsolidationCandidate({
      snapshot: {
        baseRevision: 1,
        privacyEpoch: 0,
        modeEpoch: 2,
        processedSourceSeq: 9,
        objectMembers: [{
          objectId: ids.object,
          versionId: '66666666-6666-4666-8666-666666666666',
          versionNo: 1,
          kind: 'meaning_change',
          epistemicClass: 'reported',
          lifecycle: 'active',
          payload: plan.objects[0]!.payload,
          effectiveTime: unknownTime,
          sourceIds: [],
          observationIds: [],
        }],
        relationMembers: [],
        conflictIds: [],
      },
      plan,
      observations: [makeObservation('other')],
      sourceIds: [ids.source],
      verification: { findings: [], acceptedItemKeys: ['meaning-1'], unresolvedQuestions: [] },
      provider: 'fixture-provider',
      model: 'fixture-model',
    });

    expect(candidate.processedSourceSeq).toBe(9);
    expect(candidate.observations[0]?.normalizedAssertion).toEqual({ text: 'The parent moved.' });
    const observationId = candidate.observations[0]?.observationId;
    expect(observationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(observationId).not.toBe(ids.source);
    expect(candidate.objectSupport).toContainEqual(expect.objectContaining({
      versionId: candidate.objects[0]?.versionId,
      sourceId: null,
      observationId,
    }));
    expect(candidate.objectSupport).toContainEqual(expect.objectContaining({
      versionId: candidate.objects[0]?.versionId,
      sourceId: ids.source,
      observationId: null,
    }));
  });
});
