import { PersonObjectPayloadSchema } from '@/lib/person-model/contracts';
import type { P3HistoryCase, P3InputTurn } from '../fixtures/person-model-v3/p3-history-corpus';

/** Test-only adapter around the typed object payload expected from a P3 run. */
export interface P3CandidateObject {
  epistemicClass: 'reported' | 'working_hypothesis' | 'unknown';
  payload: unknown;
  support: Array<{
    turnId: string;
    speaker: P3InputTurn['speaker'];
    subject: P3InputTurn['subject'];
    start: number;
    end: number;
    excerpt: string;
  }>;
}
export interface P3Candidate {
  objects: P3CandidateObject[];
  brief?: string;
}

export interface P3Finding {
  code: 'invalid_payload' | 'missing_kind' | 'missing_support' | 'unknown_source' |
    'source_attribution_mismatch' | 'inexact_span' | 'assistant_as_reported' |
    'unknown_not_preserved' | 'forbidden_conclusion';
  message: string;
}

function nestedValue(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, value);
}

/**
 * Deterministic invariant evaluator for the fixture adapter. It checks typed
 * shapes, evidence identity/offsets, hard unknowns and exact forbidden
 * phrases. It deliberately does not score paraphrase quality or claim to
 * replace the independent semantic verifier/human review in ACCEPTANCE-PLAN.
 */
export function evaluateP3Candidate(history: P3HistoryCase, candidate: P3Candidate): P3Finding[] {
  const findings: P3Finding[] = [];
  const parsed = candidate.objects.map((item) => {
    const result = PersonObjectPayloadSchema.safeParse(item.payload);
    if (!result.success) {
      findings.push({ code: 'invalid_payload', message: result.error.issues.map((issue) => issue.message).join('; ') });
      return null;
    }
    if (item.support.length === 0) {
      findings.push({ code: 'missing_support', message: `${result.data.kind} has no source support.` });
    }
    for (const ref of item.support) {
      const source = history.turns.find((turn) => turn.id === ref.turnId);
      if (!source) {
        findings.push({ code: 'unknown_source', message: `Unknown source turn ${ref.turnId}.` });
        continue;
      }
      if (source.speaker !== ref.speaker || source.subject !== ref.subject) {
        findings.push({ code: 'source_attribution_mismatch', message: `Attribution does not match ${ref.turnId}.` });
      }
      if (ref.start < 0 || ref.end <= ref.start || source.text.slice(ref.start, ref.end) !== ref.excerpt) {
        findings.push({ code: 'inexact_span', message: `Evidence span is not exact for ${ref.turnId}.` });
      }
      if (item.epistemicClass === 'reported' && source.speaker !== 'user') {
        findings.push({ code: 'assistant_as_reported', message: `Non-user source ${ref.turnId} cannot be direct reported evidence.` });
      }
    }
    return result.data;
  });

  for (const requiredKind of history.requiredKinds) {
    if (!parsed.some((payload) => payload?.kind === requiredKind)) {
      findings.push({ code: 'missing_kind', message: `Required object kind ${requiredKind} was not produced.` });
    }
  }

  for (const expected of history.remainUnknown) {
    const matching = parsed.find((payload) => payload?.kind === expected.kind);
    if (!matching || nestedValue(matching, expected.statusPath) !== expected.statusValue ||
      nestedValue(matching, expected.contentPath) !== expected.contentValue) {
      findings.push({ code: 'unknown_not_preserved', message: `${expected.kind}.${expected.statusPath} must remain ${expected.statusValue} with no content at ${expected.contentPath}.` });
    }
  }

  const serialized = JSON.stringify({ brief: candidate.brief ?? '', objects: parsed.filter(Boolean) }).toLocaleLowerCase();
  for (const phrase of history.forbiddenConclusions) {
    if (serialized.includes(phrase.toLocaleLowerCase())) {
      findings.push({ code: 'forbidden_conclusion', message: `Candidate contains forbidden conclusion: ${phrase}.` });
    }
  }
  return findings;
}
