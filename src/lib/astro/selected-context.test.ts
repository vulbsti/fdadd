import { describe, expect, it } from 'vitest';
import { projectSelectedSources, selectedContextBlock } from './selected-context';

const profileId = '11111111-1111-4111-8111-111111111111';
const otherProfileId = '22222222-2222-4222-8222-222222222222';

describe('selected source rehydration', () => {
  it('uses attributed source text, not bookkeeping reason or item key', () => {
    const sources = projectSelectedSources([{
      item_key: 'evidence:33333333-3333-4333-8333-333333333333',
      evidence: {
        id: '33333333-3333-4333-8333-333333333333', profile_id: profileId,
        source_kind: 'user_statement', assertion_mode: 'direct',
        summary: 'Work rhythm changes during caregiving.',
        exact_quote: 'I can work late only when my sister covers the evening.',
        occurred_on: null,
      },
    }], profileId);
    const block = selectedContextBlock(sources);
    expect(block).toContain('I can work late only when my sister covers the evening.');
    expect(block).toContain('evidence:33333333-3333-4333-8333-333333333333');
    expect(block).toContain('direct');
  });

  it('drops another person and retired facts instead of laundering them into context', () => {
    const sources = projectSelectedSources([
      { item_key: 'fact:one', fact: { id: 'one', profile_id: otherProfileId, fact_key: 'goal', summary: 'Other person', status: 'confirmed', origin: 'direct', revision: 1 } },
      { item_key: 'fact:two', fact: { id: 'two', profile_id: profileId, fact_key: 'old', summary: 'Retired claim', status: 'retired', origin: 'derived', revision: 2 } },
      { item_key: 'message:three', message: { id: 'three', role: 'user', content: 'Different profile', session: { profile_id: otherProfileId } } },
    ], profileId);
    expect(sources).toEqual([]);
  });

  it('makes context-budget omission explicit', () => {
    const block = selectedContextBlock([
      { kind: 'fact', id: 'one', title: 'first', excerpt: 'hello' },
      { kind: 'fact', id: 'two', title: 'second', excerpt: 'world' },
    ], 35);
    expect(block).toContain('additional selected sources omitted');
  });
});
