import { describe, expect, it } from 'vitest';
import { personAgentContextBlock, type AgentPersonContextBundle } from './person-agent-context';

const bundle: AgentPersonContextBundle = {
  personId: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  sourceWatermark: 7,
  modeEpoch: 2,
  privacyEpoch: 4,
  objects: [{
    objectId: '22222222-2222-4222-8222-222222222222',
    versionId: '33333333-3333-4333-8333-333333333333',
    kind: 'pattern',
    epistemicClass: 'working_hypothesis',
    lifecycle: 'active',
    payload: { title: 'Clear tasks can support focused solitude' },
    support: [{ relation: 'qualifies', sourceId: '44444444-4444-4444-8444-444444444444', observationId: null }],
  }],
  relations: [{
    relationId: '55555555-5555-4555-8555-555555555555',
    versionId: '66666666-6666-4666-8666-666666666666',
    kind: 'qualifies',
    fromObjectId: '22222222-2222-4222-8222-222222222222',
    toObjectId: '77777777-7777-4777-8777-777777777777',
    epistemicClass: 'working_hypothesis',
    lifecycle: 'active',
    payload: { rationale: 'The effect depends on context.' },
  }],
};

describe('personAgentContextBlock', () => {
  it('exposes the exact current revision as a file-shaped read-only context pack', () => {
    const block = personAgentContextBlock(bundle);
    expect(block).toContain('/person/current.json');
    expect(block).toContain('"revision":3');
    expect(block).toContain(`/person/theory-of-mind/${bundle.objects[0]!.objectId}.json`);
    expect(block).toContain(`/person/mappings/${bundle.relations[0]!.relationId}.json`);
    expect(block).toContain('qualifies');
  });

  it('states when the context budget omits records', () => {
    expect(personAgentContextBlock(bundle, 300)).toMatch(/context budget omitted/);
  });
});
