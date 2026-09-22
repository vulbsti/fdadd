import { describe, expect, it } from 'vitest';
import { p3HistoryCorpus } from '../fixtures/person-model-v3/p3-history-corpus';
import {
  ConsolidationSourceSchema,
  PersonExtractionOutputSchema,
  validateObservationSpans,
} from '@/lib/person-model/consolidation';
import { PersonObservationDraftSchema } from '@/lib/person-model/contracts';
import { evaluateP3Candidate } from './p3-evaluator';

const unknownTime = { precision: 'unknown', start: null, end: null, age: null, note: null } as const;

function fixtureUuid(historyIndex: number, turnIndex: number) {
  return `${String(historyIndex + 1).padStart(8, '0')}-0000-4000-8000-${String(turnIndex + 1).padStart(12, '0')}`;
}

describe('P3 synthetic history corpus', () => {
  it('contains at least twenty distinct, sanitized histories and covers named hard cases', () => {
    expect(p3HistoryCorpus.length).toBeGreaterThanOrEqual(20);
    expect(new Set(p3HistoryCorpus.map((history) => history.id)).size).toBe(p3HistoryCorpus.length);
    const tags = new Set(p3HistoryCorpus.flatMap((history) => history.tags));
    for (const tag of [
      'C02', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C20',
      'sparse', 'alternate-domain', 'counterexample', 'assistant-laundering', 'unknown-date',
      'conflict', 'privacy-fence',
    ]) expect(tags.has(tag), `missing corpus coverage tag ${tag}`).toBe(true);
    for (const history of p3HistoryCorpus) {
      expect(history.turns.length, history.id).toBeGreaterThan(0);
      expect(new Set(history.turns.map((turn) => turn.id)).size, history.id).toBe(history.turns.length);
      expect(history.preserve.length, history.id).toBeGreaterThan(0);
      expect(history.forbiddenConclusions.length, history.id).toBeGreaterThan(0);
    }
  });

  it('maps the entire synthetic corpus through P3 source, extraction, and exact-span contracts', () => {
    const ingestedAt = '2026-09-22T12:00:00Z';
    for (const [historyIndex, history] of p3HistoryCorpus.entries()) {
      const sources = history.turns.map((turn, turnIndex) => {
        const subjectKind = turn.subject === 'self' ? 'self'
          : turn.subject === 'third_party' ? 'other'
            : turn.subject === 'hypothetical' ? 'hypothetical' : 'unknown';
        return ConsolidationSourceSchema.parse({
          sourceId: fixtureUuid(historyIndex, turnIndex),
          sourceSeq: turnIndex + 1,
          sourceTime: null,
          ingestedAt,
          sourceKind: turn.speaker === 'user' ? 'native_message' : 'other',
          speaker: turn.speaker,
          subjectKind,
          subjectLabel: subjectKind === 'other' ? 'unspecified third party' : null,
          inclusion: 'included',
          body: turn.text,
        });
      });
      const observations = history.turns.flatMap((turn, turnIndex) => {
        if (turn.speaker !== 'user') return [];
        const subjectKind = turn.subject === 'self' ? 'self'
          : turn.subject === 'third_party' ? 'other'
            : turn.subject === 'hypothetical' ? 'hypothetical' : 'unknown';
        return [PersonObservationDraftSchema.parse({
          sourceId: fixtureUuid(historyIndex, turnIndex),
          spanStart: 0,
          spanEnd: turn.text.length,
          exactQuote: turn.text,
          normalizedAssertion: turn.text,
          subjectKind,
          subjectLabel: subjectKind === 'other' ? 'unspecified third party' : null,
          subjectPersonId: null,
          domain: history.domains[0] ?? 'unspecified',
          assertionType: 'direct',
          eventTime: unknownTime,
          extractorVersion: 'p3-fixture-contract-v1',
          verifierVersion: null,
        })];
      });
      expect(PersonExtractionOutputSchema.parse({ observations, unknowns: [] }).observations).toHaveLength(observations.length);
      expect(() => validateObservationSpans(sources, observations), history.id).not.toThrow();
      for (const [turnIndex, turn] of history.turns.entries()) {
        if (turn.speaker === 'assistant') {
          expect(sources[turnIndex]?.speaker, `${history.id}/${turn.id}`).toBe('assistant');
          expect(observations.some((observation) => observation.sourceId === fixtureUuid(historyIndex, turnIndex))).toBe(false);
        }
      }
    }
  });

  it('accepts age-only history plus explicitly unknown changed meaning when exactly supported', () => {
    const history = p3HistoryCorpus.find((item) => item.id === 'p3-h01-meaning-change')!;
    const first = history.turns[0]!;
    const second = history.turns[1]!;
    const candidate = {
      brief: 'A formative question became important; later questions challenged the goal, and its current meaning remains unknown.',
      objects: [
        {
          epistemicClass: 'reported' as const,
          support: [{ turnId: first.id, speaker: first.speaker, subject: first.subject, start: 0, end: first.text.length, excerpt: first.text }],
          payload: {
            kind: 'episode', title: 'A question became important', event: 'A question started shaping what the person wanted to do.',
            setting: null, people: [], reportedExperience: null, reportedEffects: [], unresolvedInterpretation: null,
            occurred: { precision: 'age', start: null, end: null, age: 15, note: null },
          },
        },
        {
          epistemicClass: 'unknown' as const,
          support: [{ turnId: second.id, speaker: second.speaker, subject: second.subject, start: 0, end: second.text.length, excerpt: second.text }],
          payload: {
            kind: 'meaning_change', title: 'The goal changed', priorMeaning: 'The goal mattered.',
            challengingExperience: 'Later questions challenged it.', laterMeaning: null, laterMeaningStatus: 'unknown',
            effectivePeriod: { precision: 'unknown', start: null, end: null, age: null, note: null },
          },
        },
        {
          epistemicClass: 'working_hypothesis' as const,
          support: [{ turnId: first.id, speaker: first.speaker, subject: first.subject, start: 0, end: first.text.length, excerpt: first.text }],
          payload: {
            kind: 'chapter', title: 'How the question became a goal', memberObjectIds: ['00000000-0000-4000-8000-000000000001'],
            theme: 'A question and a later challenge are connected; the current meaning remains open.', unresolvedQuestions: ['What does the goal mean now?'],
          },
        },
      ],
    };
    expect(evaluateP3Candidate(history, candidate)).toEqual([]);
  });

  it('rejects source laundering, inexact quotation spans, and forbidden conclusions', () => {
    const history = p3HistoryCorpus.find((item) => item.id === 'p3-h13-assistant-repetition')!;
    const assistant = history.turns[0]!;
    const candidate = {
      brief: 'The person needs external pressure to work.',
      objects: [{
        epistemicClass: 'reported' as const,
        support: [{ turnId: assistant.id, speaker: assistant.speaker, subject: assistant.subject, start: 0, end: assistant.text.length, excerpt: `${assistant.text}!` }],
        payload: {
          kind: 'gap', title: 'Work pressure', distinction: 'Whether external pressure is needed is not established.',
          whyItMatters: 'Advice would differ.', blockedInterpretationOrDecision: null, candidateQuestion: null, status: 'open',
        },
      }],
    };
    const findings = evaluateP3Candidate(history, candidate);
    expect(findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'inexact_span', 'assistant_as_reported', 'forbidden_conclusion',
    ]));
  });

  it('does not treat an exact but irrelevant quote as semantic support', () => {
    const history = p3HistoryCorpus.find((item) => item.id === 'p3-h14-unrelated-quote')!;
    const turn = history.turns[0]!;
    const candidate = {
      brief: 'The user wants to leave job.',
      objects: [{
        epistemicClass: 'reported' as const,
        support: [{ turnId: turn.id, speaker: turn.speaker, subject: turn.subject, start: 0, end: turn.text.length, excerpt: turn.text }],
        payload: {
          kind: 'goal', title: 'Leave the job', statedOutcome: 'Leave the job.', underlyingValue: null,
          status: 'active', timeframe: { precision: 'unknown', start: null, end: null, age: null, note: null }, purpose: null,
        },
      }],
    };
    expect(evaluateP3Candidate(history, candidate).map((item) => item.code)).toContain('forbidden_conclusion');
  });
});
