import { describe, expect, it } from 'vitest';
import { acknowledgeMessage, mergePersistedMessages, personalOnlyFromModel, type ChatMessage } from './chat-message-state';

it('recognizes the actual read-model modes without inventing a second enum', () => {
  expect(personalOnlyFromModel({ mode: 'personal' })).toBe(true);
  expect(personalOnlyFromModel({ mode: 'astrology' })).toBe(false);
  expect(personalOnlyFromModel({ mode: 'astrology_enabled' })).toBeNull();
  expect(personalOnlyFromModel({})).toBeNull();
});

const optimistic: ChatMessage = {
  id: 'client-id', clientMessageId: 'client-id', role: 'user', content: 'A question',
  createdAt: '2026-09-26T00:00:00Z', runId: null, delivery: 'sending', answerToQuestionId: 'question-id',
};
const persisted = { id: 'server-id', role: 'user' as const, content: 'A question', createdAt: optimistic.createdAt, runId: 'run-id' };
const ack = { messageId: persisted.id, runId: persisted.runId };

describe('optimistic chat reconciliation', () => {
  it('keeps a pending or failed bubble and its retry key through detail refreshes', () => {
    const failed = { ...optimistic, delivery: 'failed' as const };
    expect(mergePersistedMessages([failed], [])).toEqual([failed]);
  });

  it('replaces an acknowledged bubble with the durable row without a duplicate', () => {
    const acknowledged = acknowledgeMessage([optimistic], optimistic.clientMessageId!, ack);
    expect(acknowledged[0]).toMatchObject({ id: persisted.id, clientMessageId: optimistic.clientMessageId, delivery: 'accepted' });
    expect(mergePersistedMessages(acknowledged, [persisted])).toEqual([persisted]);
  });

  it('deduplicates when the detail request wins the acknowledgement race', () => {
    const messages = mergePersistedMessages([optimistic], [persisted]);
    expect(acknowledgeMessage(messages, optimistic.clientMessageId!, ack)).toEqual([persisted]);
  });

  it('keeps repeated identical text distinct', () => {
    const old = { ...persisted, id: 'old-id' };
    expect(acknowledgeMessage([old, optimistic], optimistic.clientMessageId!, ack)).toHaveLength(2);
  });
});
