'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, HelpCircle, Laptop, Sparkles, TrendingDown, Users } from 'lucide-react';
import { ProfileTabs } from './ProfileTabs';
import { ProjectionNotice } from './ProjectionState';
import type { ObjectProjection, ViewNode } from './types';
import ExploreInChatButton from './ExploreInChatButton';
import SourceDrawer from './SourceDrawer';

function text(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function list(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export default function PatternDetailView({ projection }: { projection: ObjectProjection }) {
  const [rejectionState, setRejectionState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pattern = projection.object;
  const payload = pattern.payload;
  const supporting = projection.related.filter((node) => node.kind === 'episode');
  const exceptions = list(payload, 'exceptions');
  const trigger = text(payload, 'triggerOrContext', 'A situation you have described');
  const attention = text(payload, 'expectationOrAttention', 'Attention or expectation not specified');
  const response = text(payload, 'response', 'The response you noticed');
  const consequence = text(payload, 'reportedConsequence', 'Consequence not yet established');
  const alternatives = list(payload, 'alternativeExplanations');
  const question = text(payload, 'candidateQuestion', 'What is different when this pattern helps?');

  async function reject() {
    setRejectionState('saving');
    try {
      const response = await fetch(`/api/astrologer/profiles/${projection.personId}/changes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'reject_interpretation', clientCommandId: crypto.randomUUID(), expectedRevision: projection.personRevision, targetId: pattern.id }),
      });
      if (!response.ok) throw new Error('rejection was not accepted');
      setRejectionState('saved');
    } catch {
      setRejectionState('error');
    }
  }

  return (
    <>
      <ProfileTabs personId={projection.personId} />
      <ProjectionNotice state={projection.updateState} />
      <article className="px-5 pb-8 pt-6 md:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-[#687387]"><Link href={`/astrologer/p/${projection.personId}/profile/patterns`}>How you think</Link><span className="mx-3">/</span><span>{pattern.title}</span></nav>
        <h1 className="mt-3 font-serif text-[42px] leading-tight tracking-[-.02em] md:text-[50px]">{pattern.title}</h1>
        <p className="mt-1 text-lg text-[#40516d]">A working explanation grounded in {projection.supportCount} source {projection.supportCount === 1 ? 'account' : 'accounts'}.</p>

        <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_330px]">
          <section className="overflow-hidden rounded-md border border-[#ded9d0] bg-white/40" aria-labelledby="pattern-diagram">
            <h2 id="pattern-diagram" className="border-b bg-[#f1eee8] px-6 py-4 font-serif text-xl">The rhythm you described</h2>
            <section aria-labelledby="observed-sequence-heading" className="px-5 py-8">
              <h3 id="observed-sequence-heading" className="sr-only">Observed sequence</h3>
              <div className="grid items-stretch gap-3 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                <div className="flex flex-col items-center justify-center rounded-md bg-[#f5f7f8] p-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#e4ebf1]"><Users aria-hidden /></span><strong className="mt-3 block">{trigger}</strong></div>
                <ArrowRight aria-hidden className="mx-auto self-center rotate-90 sm:rotate-0" />
                <div className="flex flex-col items-center justify-center rounded-md bg-[#f7f8f2] p-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#e7eadc]"><Sparkles aria-hidden /></span><strong className="mt-3 block">{response}</strong></div>
                <ArrowRight aria-hidden className="mx-auto self-center rotate-90 sm:rotate-0" />
                <div className="flex flex-col items-center justify-center rounded-md bg-[#f5f7f8] p-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#e6ebf2]"><Laptop aria-hidden /></span><strong className="mt-3 block">{consequence}</strong></div>
              </div>
              <p className="mt-4 text-center text-xs text-[#687387]">{attention}</p>
              <div className="mx-auto mt-5 flex max-w-[78%] items-center gap-3 text-xs text-[#52627a]">
                <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />
                <span className="h-px flex-1 bg-[#8ea0b3]" />
                <span>Cycle to compare: what makes returning possible?</span>
              </div>
            </section>
            <section aria-labelledby="alternate-path-heading" className="border-t bg-[#fbfaf7] px-6 py-7">
              <h3 id="alternate-path-heading" className="font-serif text-xl">When the cycle changes</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#687387]">These are reported exceptions and alternative explanations—not assumed outcomes.</p>
              {exceptions.length || alternatives.length ? (
                <div className="mt-5 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="rounded-md border border-dashed border-[#8b9f86] bg-[#f3f6ef] p-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e4e9dd]"><TrendingDown aria-hidden className="h-5 w-5" /></span><span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.12em] text-[#596f54]">Reported exception</span><p className="mt-2 text-sm leading-6 text-[#40516d]">{exceptions[0] || 'No reported exception yet.'}</p></div>
                  <ArrowRight aria-hidden className="mx-auto rotate-90 md:rotate-0" />
                  <div className="rounded-md border border-dashed border-[#bd9d72] bg-[#faf5ed] p-4"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#88643b]">Alternative explanation</span><p className="mt-2 text-sm leading-6 text-[#40516d]">{alternatives[0] || 'The outcome remains unknown.'}</p></div>
                  <ArrowRight aria-hidden className="mx-auto rotate-90 md:rotate-0" />
                  <div className="flex items-center gap-3 rounded-md border border-dashed border-[#7890aa] p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#37648f]"><HelpCircle /></span><div><strong className="text-sm">{question}</strong><p className="mt-1 text-xs text-[#687387]">Still to understand</p></div></div>
                </div>
              ) : <p className="mt-2 text-sm text-[#687387]">No exception has been confirmed yet. The same path should not be treated as a fixed trait.</p>}
              {!exceptions.length && !alternatives.length ? <div className="mt-7 flex items-center gap-4 border-t border-dashed pt-6"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#37648f]"><HelpCircle /></span><div><strong>{question}</strong><p className="text-sm text-[#687387]">Still to understand</p></div></div> : null}
            </section>
          </section>
          <aside className="rounded-md border border-[#ded9d0] px-6 py-6">
            <h2 className="font-serif text-2xl">A working explanation</h2>
            <p className="mt-3 leading-7 text-[#40516d]">{text(payload, 'workingExplanation', pattern.summary || 'The conditions around this response may matter more than a fixed label.')}</p>
            <hr className="my-7" />
            <h2 className="font-serif text-2xl">The exception matters</h2>
            <p className="mt-3 leading-7 text-[#40516d]">{exceptions[0] || 'An exception has not yet been established. One counterexample could change this understanding.'}</p>
            {projection.mode === 'astrology' ? <><hr className="my-7" /><h2 className="font-serif text-2xl">Astrological connection</h2><p className="mt-3 text-[#40516d]">Open a claim-specific reading to inspect its calculation, alternatives, and uncertainty.</p></> : null}
          </aside>
        </div>
        {supporting.length ? <section className="mt-0 rounded-b-md border border-t-0 px-6 py-4"><h2 className="font-serif text-lg">Episodes to compare</h2><ol className="mt-3 grid gap-4 md:grid-cols-3">{supporting.slice(0, 6).map((node: ViewNode) => <li key={node.id}><Link href={`/astrologer/p/${projection.personId}/profile/life-map/episodes/${node.id}`} className="text-sm underline-offset-4 hover:underline"><strong className="block">{node.dateLabel || 'Date not specified'} · {node.title}</strong><span className="text-[#687387]">{node.summary}</span></Link></li>)}</ol></section> : null}
        <section data-testid="pattern-rejection-panel" className="mt-8 rounded-md border border-[#284b6d] bg-[#153a5c] px-5 py-5 text-white shadow-[0_-8px_30px_rgba(15,40,65,.08)] md:px-8">
          <p className="font-serif italic text-white/75">A question that could change this understanding</p>
          <div className="mt-1 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><h2 className="max-w-4xl font-serif text-xl md:text-2xl">{question}</h2><div className="flex flex-wrap gap-3"><ExploreInChatButton personId={projection.personId} objectId={pattern.id} personRevision={projection.personRevision} /><button type="button" onClick={reject} disabled={rejectionState === 'saving' || rejectionState === 'saved'} className="px-3 text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{rejectionState === 'saving' ? 'Recording…' : rejectionState === 'saved' ? 'Recorded for review' : rejectionState === 'error' ? 'Try recording again' : 'This does not fit me'}</button></div></div>
          {rejectionState === 'error' ? <p role="alert" className="mt-3 text-right text-sm text-[#ffd7d7]">This was not recorded. Please try again.</p> : null}
        </section>
        <SourceDrawer node={pattern} sources={projection.sources} />
      </article>
    </>
  );
}
