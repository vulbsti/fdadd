import { describe, expect, it } from 'vitest';
import { assembleConsolidationSources, explicitExclusionObjectIds, personChangeSourceBody } from './consolidation-source';

const sourceId = '11111111-1111-4111-8111-111111111111';
const changeId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceId,
    source_seq: 4,
    source_kind: 'explicit_correction',
    source_message_id: null,
    speaker_role: 'user',
    subject_kind: 'self',
    subject_label: null,
    source_time: null,
    ingested_at: '2026-09-22T12:00:00Z',
    inclusion_status: 'included',
    ...overrides,
  };
}

function change(request: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: changeId,
    source_item_id: sourceId,
    change_kind: 'correction',
    target_kind: 'object',
    target_id: targetId,
    prior_version_id: null,
    request,
    ...overrides,
  };
}

describe('typed person-change consolidation sources', () => {
  it.each([
    [{ kind: 'correct_account', payload: { correction: 'The move happened in 2025.' } }, 'The move happened in 2025.'],
    [{ kind: 'reject_interpretation', explanation: 'That pattern does not fit me.' }, 'That pattern does not fit me.'],
    [{ kind: 'add_event', payload: { what: 'I changed teams.', when: 'Last spring', whatChanged: 'I felt supported.' } }, 'I changed teams.\nLast spring\nI felt supported.'],
    [{ kind: 'add_meaning', payload: { meaning: 'It became a boundary.', context: 'After more time.' } }, 'It became a boundary.\nAfter more time.'],
  ])('recovers exact user text from %s', (request, expected) => {
    expect(personChangeSourceBody(request)).toBe(expected);
  });

  it('loads an included correction from its immutable change ledger row', () => {
    const [result] = assembleConsolidationSources({
      sourceRows: [source()],
      messageRows: [],
      changeRows: [change({ kind: 'correct_account', payload: { correction: 'The move happened in 2025.' } })],
      impactRows: [{ change_id: changeId, entity_kind: 'object', entity_id: targetId }],
    });

    expect(result.body).toBe('The move happened in 2025.');
    expect(result.change).toEqual(expect.objectContaining({
      changeId, changeKind: 'correction', targetKind: 'object', targetId,
      invalidatedObjectIds: [targetId],
    }));
  });

  it('preserves explicit exclusion as control metadata instead of a chat message', () => {
    const request = { kind: 'exclude_source', sourceId: targetId };
    const [result] = assembleConsolidationSources({
      sourceRows: [source({ source_kind: 'explicit_exclusion' })],
      messageRows: [],
      changeRows: [change(request, { change_kind: 'exclusion', target_kind: 'source' })],
      impactRows: [{ change_id: changeId, entity_kind: 'object', entity_id: targetId }],
    });

    expect(result.sourceKind).toBe('explicit_exclusion');
    expect(result.body).toBe(JSON.stringify(request));
    expect(result.change?.request).toEqual(request);
    expect([...explicitExclusionObjectIds([result])]).toEqual([targetId]);
  });

  it('still rejects an included source with neither a message nor a change request', () => {
    expect(() => assembleConsolidationSources({ sourceRows: [source()], messageRows: [], changeRows: [], impactRows: [] }))
      .toThrow(/message or typed change request/);
  });
});
