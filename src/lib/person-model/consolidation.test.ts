import { describe, expect, it } from 'vitest';
import {
  callPersonStage,
  bindExplicitObjectChangeTargets,
  bindPlanEvidenceToObservations,
  coldStartMatchAndReconciliation,
  explicitObjectChangeMatchAndReconciliation,
  MalformedPersonStageOutputError,
  PersonCompositionPlanSchema,
  PersonExtractionOutputSchema,
  PersonIdentifiedObservationSchema,
  PersonReconciliationOutputSchema,
  materializeConsolidationCandidate,
  normalizeMissingProviderNulls,
  normalizeObservationSpans,
  personStageToolParameters,
  resolveChangeIdsForPlan,
  validateExplicitChangeCoverage,
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
    change: null,
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
        expect(options.responseFormat).toEqual({ type: 'json_object' });
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
    expect(extraction.properties.observations.items.properties.assertionType.description)
      .toContain('Use direct for an explicit statement');
    expect(extraction.properties.observations.items.properties.exactQuote.anyOf[0].type).toBe('string');
    const repair = personStageToolParameters('repair') as any;
    expect(repair.properties.objects.items.properties.lifecycle.enum)
      .toEqual(['active', 'superseded', 'retired', 'invalidated']);
    const payloadOptions = repair.properties.objects.items.properties.payload.anyOf as Array<Record<string, any>>;
    const meaningChange = payloadOptions.find((option) =>
      option.properties?.kind?.const === 'meaning_change');
    expect(meaningChange?.properties?.laterMeaningStatus?.description)
      .toContain('Use unknown when the person says the meaning is unresolved');
    expect(meaningChange?.properties?.laterMeaningStatus?.description)
      .toContain('not_yet_shared only when the person explicitly withholds');
  });

  it('fills only omitted nullable provider fields before strict validation', () => {
    const observation = makeObservation('self') as Record<string, unknown>;
    delete observation.subjectPersonId;
    delete observation.verifierVersion;
    observation.eventTime = { precision: 'unknown' };
    const parameters = personStageToolParameters('extract');
    const normalized = normalizeMissingProviderNulls({ observations: [observation], unknowns: [] }, parameters);
    const parsed = PersonExtractionOutputSchema.parse(normalized);
    expect(parsed.observations[0]).toMatchObject({
      subjectPersonId: null,
      verifierVersion: null,
      eventTime: { precision: 'unknown', start: null, end: null, age: null, note: null },
    });

    const missingRequired = { ...(normalized as { observations: Array<Record<string, unknown>>; unknowns: unknown[] }) };
    missingRequired.observations = [{ ...missingRequired.observations[0] }];
    delete missingRequired.observations[0]!.normalizedAssertion;
    expect(PersonExtractionOutputSchema.safeParse(
      normalizeMissingProviderNulls(missingRequired, parameters),
    ).success).toBe(false);
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

  it('uses typed correction authority instead of fuzzy provider matching', () => {
    const correction = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: '66666666-6666-4666-8666-666666666666', changeKind: 'correction', targetKind: 'object',
        targetId: ids.object, priorVersionId: null, request: { kind: 'correct_account' },
        invalidatedObjectIds: [ids.object],
      },
    });
    const observation = PersonIdentifiedObservationSchema.parse({
      ...makeObservation('self'), observationId: ids.observation,
    });
    const priorObservationId = '99999999-9999-4999-8999-999999999999';
    const snapshot = {
      baseRevision: 1, privacyEpoch: 0, modeEpoch: 0, processedSourceSeq: 1,
      objectMembers: [{
        objectId: ids.object, versionId: '88888888-8888-4888-8888-888888888888', versionNo: 1,
        kind: 'meaning_change', epistemicClass: 'reported' as const, lifecycle: 'active' as const,
        payload: makePlan().objects[0]!.payload, effectiveTime: unknownTime,
        sourceIds: [ids.otherSource], observationIds: [priorObservationId],
      }], relationMembers: [], conflictIds: [],
    };
    const countercontext: CountercontextItem[] = [{
      observationId: priorObservationId, sourceId: ids.otherSource, subjectKind: 'self',
      assertionType: 'direct', status: 'verified', assertion: 'Earlier account.', eventTime: unknownTime,
    }];
    const deterministic = explicitObjectChangeMatchAndReconciliation(
      [correction], snapshot, countercontext, [observation],
    );
    expect(deterministic?.match).toEqual({
      matches: [expect.objectContaining({ observationIndex: 0, targetObjectId: ids.object, matchKind: 'correction_target' })],
      countercontextObservationIds: [priorObservationId],
    });
    expect(deterministic?.reconciliation.decisions[0]).toMatchObject({
      observationIndex: 0, disposition: 'correction',
      counterevidence: [expect.objectContaining({ observationId: priorObservationId, impact: 'qualifies' })],
    });
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

  it('uses DB-compatible lifecycles/assertion types and links staged evidence to its observation UUID', () => {
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
      observations: [{ ...makeObservation('other'), assertionType: 'correction' as const }],
      sources: [makeSource()],
      sourceIds: [ids.source],
      verification: { findings: [], acceptedItemKeys: ['meaning-1'], unresolvedQuestions: [] },
      provider: 'fixture-provider',
      model: 'fixture-model',
    });

    expect(candidate.processedSourceSeq).toBe(9);
    expect(candidate.observations[0]?.normalizedAssertion).toEqual({ text: 'The parent moved.' });
    expect(candidate.observations[0]?.assertionType).toBe('direct');
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

  it('removes invalidated objects and their relations from the next revision', () => {
    const secondObject = '77777777-7777-4777-8777-777777777777';
    const relationId = '88888888-8888-4888-8888-888888888888';
    const plan = PersonCompositionPlanSchema.parse({
      ...makePlan(),
      objects: [{ ...makePlan().objects[0]!, lifecycle: 'invalidated' }],
      relations: [],
      changedKeys: ['meaning-1'],
    });
    const candidate = materializeConsolidationCandidate({
      snapshot: {
        baseRevision: 2, privacyEpoch: 1, modeEpoch: 0, processedSourceSeq: 3,
        objectMembers: [
          {
            objectId: ids.object, versionId: '66666666-6666-4666-8666-666666666666', versionNo: 1,
            kind: 'meaning_change', epistemicClass: 'reported', lifecycle: 'active', payload: plan.objects[0]!.payload,
            effectiveTime: unknownTime, sourceIds: [], observationIds: [],
          },
          {
            objectId: secondObject, versionId: '99999999-9999-4999-8999-999999999999', versionNo: 1,
            kind: 'goal', epistemicClass: 'reported', lifecycle: 'active',
            payload: { kind: 'goal', title: 'Keep learning', statedOutcome: 'Keep learning', underlyingValue: null, status: 'active', timeframe: unknownTime, purpose: null },
            effectiveTime: unknownTime, sourceIds: [], observationIds: [],
          },
        ],
        relationMembers: [{
          relationId, versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', versionNo: 1,
          kind: 'supports', fromObjectId: ids.object, toObjectId: secondObject,
          epistemicClass: 'reported', lifecycle: 'active', rationale: null, sourceIds: [], observationIds: [],
        }],
        conflictIds: [],
      },
      plan,
      observations: [makeObservation()],
      sources: [makeSource()],
      sourceIds: [ids.source],
      verification: { findings: [], acceptedItemKeys: ['meaning-1'], unresolvedQuestions: [] },
      provider: 'fixture-provider', model: 'fixture-model',
    });

    expect(candidate.publication.objectMembers.map((member) => member.objectId)).toEqual([secondObject]);
    expect(candidate.publication.relationMembers).toEqual([]);
    expect(candidate.objects[0]?.lifecycle).toBe('invalidated');
  });

  it('carries prior provenance into an updated active version and qualifies it for corrections', () => {
    const priorSource = '77777777-7777-4777-8777-777777777777';
    const priorObservation = '88888888-8888-4888-8888-888888888888';
    const plan = PersonCompositionPlanSchema.parse({
      ...makePlan(),
      objects: [makePlan().objects[0]],
      changedKeys: ['meaning-1'],
    });
    const correction = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: '99999999-9999-4999-8999-999999999999',
        changeKind: 'correction',
        targetKind: 'object',
        targetId: ids.object,
        priorVersionId: '66666666-6666-4666-8666-666666666666',
        request: { kind: 'correct_account', payload: { correction: 'The date was 2025.' } },
        invalidatedObjectIds: [ids.object],
      },
    });
    const candidate = materializeConsolidationCandidate({
      snapshot: {
        baseRevision: 2,
        privacyEpoch: 1,
        modeEpoch: 0,
        processedSourceSeq: 3,
        objectMembers: [{
          objectId: ids.object,
          versionId: '66666666-6666-4666-8666-666666666666',
          versionNo: 1,
          kind: 'meaning_change',
          epistemicClass: 'reported',
          lifecycle: 'active',
          payload: plan.objects[0]!.payload,
          effectiveTime: unknownTime,
          sourceIds: [priorSource],
          observationIds: [priorObservation],
        }],
        relationMembers: [],
        conflictIds: [],
      },
      plan,
      observations: [makeObservation()],
      sources: [correction],
      sourceIds: [ids.source],
      verification: { findings: [], acceptedItemKeys: ['meaning-1'], unresolvedQuestions: [] },
      provider: 'fixture-provider',
      model: 'fixture-model',
    });
    const versionId = candidate.objects[0]!.versionId;

    expect(candidate.objectSupport).toEqual(expect.arrayContaining([
      expect.objectContaining({ versionId, sourceId: priorSource, relation: 'qualifies' }),
      expect.objectContaining({ versionId, observationId: priorObservation, relation: 'qualifies' }),
      expect.objectContaining({ versionId, sourceId: ids.source, relation: 'supports' }),
    ]));
  });

  it('resolves only changes represented by the verified plan', () => {
    const plan = makePlan();
    const correction = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: '66666666-6666-4666-8666-666666666666', changeKind: 'correction', targetKind: 'object',
        targetId: ids.object, priorVersionId: null, request: { kind: 'correct_account' },
        invalidatedObjectIds: [ids.object],
      },
    });
    const unrepresented = makeSource({
      sourceId: ids.otherSource,
      change: {
        changeId: '77777777-7777-4777-8777-777777777777', changeKind: 'inclusion', targetKind: 'person',
        targetId: ids.person, priorVersionId: null, request: { kind: 'add_event' },
        invalidatedObjectIds: [],
      },
    });
    expect(resolveChangeIdsForPlan([correction, unrepresented], plan)).toEqual([
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ]);
    expect(resolveChangeIdsForPlan([unrepresented], { ...plan, objects: [], relations: [] })).toEqual([]);
  });

  it('binds one unambiguous correction proposal to its authoritative typed-change target', () => {
    const correction = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: '66666666-6666-4666-8666-666666666666', changeKind: 'correction', targetKind: 'object',
        targetId: ids.object, priorVersionId: null, request: { kind: 'correct_account' },
        invalidatedObjectIds: [ids.object],
      },
    });
    const plan = makePlan();
    const unbound = PersonCompositionPlanSchema.parse({
      ...plan,
      objects: plan.objects.filter((item) => item.key === 'meaning-1').map((item) => ({
        ...item, existingObjectId: null, sourceIds: [ids.source],
      })),
      changedKeys: ['meaning-1'],
    });
    const snapshot = {
      baseRevision: 1, privacyEpoch: 0, modeEpoch: 0, processedSourceSeq: 0,
      objectMembers: [{
        objectId: ids.object, versionId: '88888888-8888-4888-8888-888888888888', versionNo: 1,
        kind: 'meaning_change', epistemicClass: 'reported' as const, lifecycle: 'active' as const,
        payload: unbound.objects[0]!.payload, effectiveTime: unknownTime, sourceIds: [], observationIds: [],
      }],
      relationMembers: [], conflictIds: [],
    };
    const bound = bindExplicitObjectChangeTargets([correction], snapshot, unbound);
    expect(bound.objects[0]).toMatchObject({ existingObjectId: ids.object, lifecycle: 'active' });
    expect(() => validateExplicitChangeCoverage([correction], bound)).not.toThrow();
  });

  it('derives new support from validated observation indexes instead of model-selected historical sources', () => {
    const plan = makePlan();
    const currentObservation = PersonIdentifiedObservationSchema.parse({
      ...makeObservation('self'), observationId: ids.observation,
    });
    const rebound = bindPlanEvidenceToObservations(PersonCompositionPlanSchema.parse({
      ...plan,
      objects: [{ ...plan.objects[0]!, sourceIds: [ids.otherSource], observationIndexes: [0] }],
      changedKeys: ['meaning-1'],
    }), [currentObservation]);
    expect(rebound.objects[0]?.sourceIds).toEqual([ids.source]);
    expect(() => bindPlanEvidenceToObservations({
      ...rebound,
      objects: [{ ...rebound.objects[0]!, observationIndexes: [1] }],
    }, [currentObservation])).toThrow(/unknown extracted observation/);
  });

  it('rejects ambiguous or verifier-dropped explicit corrections', () => {
    const correction = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: '66666666-6666-4666-8666-666666666666', changeKind: 'correction', targetKind: 'object',
        targetId: ids.object, priorVersionId: null, request: { kind: 'correct_account' },
        invalidatedObjectIds: [ids.object],
      },
    });
    const plan = makePlan();
    expect(() => validateExplicitChangeCoverage([correction], { ...plan, objects: [], relations: [] }))
      .toThrow(/did not represent every explicit correction/);
    const existing = plan.objects[0]!;
    const snapshot = {
      baseRevision: 1, privacyEpoch: 0, modeEpoch: 0, processedSourceSeq: 0,
      objectMembers: [{
        objectId: ids.object, versionId: '88888888-8888-4888-8888-888888888888', versionNo: 1,
        kind: existing.payload.kind, epistemicClass: 'reported' as const, lifecycle: 'active' as const,
        payload: existing.payload, effectiveTime: unknownTime, sourceIds: [], observationIds: [],
      }], relationMembers: [], conflictIds: [],
    };
    const duplicate = { ...existing, existingObjectId: null, key: 'meaning-2' };
    expect(() => bindExplicitObjectChangeTargets([correction], snapshot, {
      ...plan,
      objects: [{ ...existing, existingObjectId: null }, duplicate],
      changedKeys: ['meaning-1', 'meaning-2'],
    })).toThrow(/unambiguous kind-compatible target/);
  });

  it('resolves exclusions after snapshot filtering and a rejection only after active membership is removed', () => {
    const rejectionId = '66666666-6666-4666-8666-666666666666';
    const rejection = makeSource({
      sourceKind: 'explicit_correction',
      change: {
        changeId: rejectionId, changeKind: 'rejection', targetKind: 'object', targetId: ids.object,
        priorVersionId: null, request: { kind: 'reject_interpretation' },
        invalidatedObjectIds: [ids.object],
      },
    });
    const activePlan = makePlan();
    expect(resolveChangeIdsForPlan([rejection], activePlan)).toEqual([]);
    expect(resolveChangeIdsForPlan([rejection], {
      ...activePlan,
      objects: activePlan.objects.map((item) => item.existingObjectId === ids.object
        ? { ...item, lifecycle: 'invalidated' as const }
        : item),
    })).toEqual([rejectionId]);

    const exclusion = makeSource({
      sourceKind: 'explicit_exclusion',
      change: {
        changeId: '77777777-7777-4777-8777-777777777777', changeKind: 'exclusion', targetKind: 'source',
        targetId: ids.otherSource, priorVersionId: null, request: { kind: 'exclude_source' },
        invalidatedObjectIds: [ids.object],
      },
    });
    expect(resolveChangeIdsForPlan([exclusion], activePlan)).toEqual(['77777777-7777-4777-8777-777777777777']);
  });
});
