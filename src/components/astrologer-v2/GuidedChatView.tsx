'use client';

import Link from 'next/link';
import { Map, Sprout } from 'lucide-react';
import AstrologerChat from '@/components/astrologer/AstrologerChat';

interface GuidedChatViewProps {
  personId: string;
  sessionId: string;
  context?: {
    objectId: string;
    title: string;
    kind: string;
    personRevision: number;
    payload: Record<string, unknown>;
  } | null;
  personalOnly?: boolean;
  anchorMessageId?: string;
}

function field(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstListItem(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return Array.isArray(value)
    ? value.find((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? null
    : null;
}

export default function GuidedChatView({ personId, sessionId, context, personalOnly = false, anchorMessageId }: GuidedChatViewProps) {
  const stays = context ? field(context.payload, ['priorMeaning', 'triggerOrContext', 'event', 'theme', 'currentState', 'summary']) : null;
  const mayChange = context ? field(context.payload, ['laterMeaning', 'possibleDevelopment', 'uncertainty'])
    ?? firstListItem(context.payload, 'unresolvedQuestions')
    ?? firstListItem(context.payload, 'exceptions') : null;
  const focusedQuestion = context ? field(context.payload, ['candidateQuestion'])
    ?? firstListItem(context.payload, 'unresolvedQuestions')
    ?? 'Which part of this account would you like to examine more closely?' : null;
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1120px] flex-col px-5 pb-6 pt-5 md:px-8">
      <h1 className="shrink-0 font-serif text-4xl leading-tight md:text-5xl">{context?.title || 'A conversation about your life'}</h1>
      {context ? <p className="mt-1 shrink-0 text-sm text-[#40516d]">From your profile · <Link className="text-[#9b642c] underline underline-offset-4" href={`/astrologer/p/${personId}/profile/life-map/episodes/${context.objectId}`}>{context.title}</Link></p> : null}
      {context ? (
        <section aria-label="Conversation context" className="mt-5 flex shrink-0 flex-col justify-between gap-4 rounded-md bg-[#eef0e6] px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#dfe5cf] text-[#34594e]"><Sprout /></span><div><h2 className="font-serif text-lg">Exploring a connection in your life</h2><p className="mt-1 text-sm text-[#40516d]">Saved from person revision {context.personRevision} · {context.kind.replaceAll('_', ' ')}</p></div></div>
          <Link href={`/astrologer/p/${personId}/profile/life-map`} className="flex items-center gap-2 border-l border-[#cfd2c4] px-5 text-sm text-[#9b642c]"><Map className="h-5 w-5" /> Open life map</Link>
        </section>
      ) : null}
      {context ? (
        <section aria-label="Guided exploration" className="mt-4 grid shrink-0 gap-3 rounded-md border border-[#ded9d0] bg-[#fffdf9] p-4 md:grid-cols-2">
          <div className="rounded-md bg-[#f1f4ec] p-4"><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#5d6d62]">What stays in the account</p><p className="mt-2 text-sm leading-6 text-[#2f4058]">{stays || context.title}</p></div>
          <div className="rounded-md bg-[#f6f1e9] p-4"><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#7c684d]">What may change</p><p className="mt-2 text-sm leading-6 text-[#2f4058]">{mayChange || 'Your profile does not yet contain a reported answer. This remains open rather than inferred.'}</p></div>
          <div className="md:col-span-2"><p className="font-serif text-lg">{focusedQuestion}</p><p className="mt-1 text-xs text-[#687387]">Respond below. Your reply is stored as your own message; this opening context is not.</p></div>
        </section>
      ) : null}
      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-md border border-[#ded9d0] bg-[#fffdf9]">
        <AstrologerChat
          sessionId={sessionId}
          className="h-full"
          personalOnly={personalOnly}
          anchorMessageId={anchorMessageId}
          emptyPrompts={context ? [focusedQuestion ?? 'What should we examine first?', 'What evidence supports this account?', 'I want to correct this account'] : []}
        />
      </div>
    </div>
  );
}
