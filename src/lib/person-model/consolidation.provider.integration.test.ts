import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  callPersonStage,
  normalizeObservationSpans,
  personStageToolParameters,
  validateObservationSpans,
  type ConsolidationSource,
  type PersonExtractionOutput,
} from './consolidation';

const liveIt = process.env.P3_PROVIDER_CANARY === '1' ? it : it.skip;

describe('prototype consolidation provider', () => {
  liveIt('Luna extracts a strict, exactly quoted person observation', async () => {
    const body = 'Working alone helps me focus when I have one clear task.';
    const source: ConsolidationSource = {
      sourceId: randomUUID(),
      sourceSeq: 1,
      sourceTime: '2026-09-24T00:00:00.000Z',
      ingestedAt: '2026-09-24T00:00:01.000Z',
      sourceKind: 'native_message',
      speaker: 'user',
      subjectKind: 'self',
      subjectLabel: null,
      inclusion: 'included',
      body,
      change: null,
    };
    const result = await callPersonStage<PersonExtractionOutput>({
      stage: 'extract',
      toolName: 'extract_person_observations',
      description: 'Return strictly source-grounded observations with exact quote spans.',
      parameters: personStageToolParameters('extract'),
      system: 'Extract only explicit user statements. Every observation must cite an exact JavaScript string slice from the supplied source. Return only the requested tool result.',
      content: JSON.stringify({ sources: [source] }),
      model: 'gpt-6-luna',
      sessionId: `p3-extract-${randomUUID()}`,
      maxTokens: 2_500,
    });
    expect(result.value.observations.length).toBeGreaterThan(0);
    const observations = normalizeObservationSpans([source], result.value.observations);
    validateObservationSpans([source], observations);
    expect(observations[0]).toMatchObject({
      sourceId: source.sourceId,
      subjectKind: 'self',
      assertionType: 'direct',
    });
  }, 130_000);
});
