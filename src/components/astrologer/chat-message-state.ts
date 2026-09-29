import type { AstrologerMessage, StartRunResponse } from '@/lib/astro/contracts';
import { PersonReadProjectionSchema } from '@/lib/person-model/projection-contract';

/** Use the read-model contract, not a separately invented presentation enum. */
export function personalOnlyFromModel(value: unknown): boolean | null {
  const result = PersonReadProjectionSchema.pick({ mode: true }).safeParse(value);
  return result.success ? result.data.mode === 'personal' : null;
}

export type ChatMessage = AstrologerMessage & {
  clientMessageId?: string;
  /** `queued`: written while an answer was running; sent when it finishes. */
  delivery?: 'queued' | 'sending' | 'accepted' | 'failed';
  answerToQuestionId?: string;
};

/** Keep unconfirmed sends visible until the canonical message has been read. */
export function mergePersistedMessages(current: ChatMessage[], persisted: AstrologerMessage[]): ChatMessage[] {
  const persistedIds = new Set(persisted.map((message) => message.id));
  return [
    ...persisted,
    ...current.filter((message) => message.clientMessageId && !persistedIds.has(message.id)),
  ];
}

/** The server ID, rather than text equality, identifies an optimistic bubble. */
export function acknowledgeMessage(
  messages: ChatMessage[],
  clientMessageId: string,
  started: Pick<StartRunResponse, 'messageId' | 'runId'>,
): ChatMessage[] {
  const persisted = started.messageId
    ? messages.find((message) => message.id === started.messageId && message.clientMessageId !== clientMessageId)
    : undefined;
  return messages.flatMap((message) => {
    if (message.clientMessageId !== clientMessageId) return [message];
    if (persisted) return [];
    return [{ ...message, id: started.messageId ?? message.id, runId: started.runId, delivery: 'accepted' as const }];
  });
}

/**
 * Messages written during a run go out together as one message once it ends,
 * so the next answer reads everything the person added. The first queued
 * bubble carries the joined text; the others fold into it.
 */
export function takeQueuedMessages(messages: ChatMessage[]): { messages: ChatMessage[]; send: ChatMessage | null } {
  const queued = messages.filter((message) => message.delivery === 'queued');
  if (!queued.length) return { messages, send: null };
  const [first, ...rest] = queued;
  const folded = new Set(rest.map((message) => message.id));
  const send: ChatMessage = { ...first, content: queued.map((message) => message.content).join('\n\n') };
  return {
    messages: messages.flatMap((message) => folded.has(message.id) ? [] : message.id === first.id ? [send] : [message]),
    send,
  };
}
