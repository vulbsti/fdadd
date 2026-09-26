import type { AstrologerMessage, StartRunResponse } from '@/lib/astro/contracts';
import { PersonReadProjectionSchema } from '@/lib/person-model/projection-contract';

/** Use the read-model contract, not a separately invented presentation enum. */
export function personalOnlyFromModel(value: unknown): boolean | null {
  const result = PersonReadProjectionSchema.pick({ mode: true }).safeParse(value);
  return result.success ? result.data.mode === 'personal' : null;
}

export type ChatMessage = AstrologerMessage & {
  clientMessageId?: string;
  delivery?: 'sending' | 'accepted' | 'failed';
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
