'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { ProfileTabs } from './ProfileTabs';
import { ProjectionNotice } from './ProjectionState';
import type { ObjectProjection, ViewNode } from './types';
import ExploreInChatButton from './ExploreInChatButton';
import SourceDrawer from './SourceDrawer';

function field(node: ViewNode, key: string, fallback: string): string {
  const value = node.payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export default function ChapterDetailView({ projection }: { projection: ObjectProjection }) {
  const chapter = projection.object;
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState('');
  const [saved, setSaved] = useState(false);
  const stages = projection.related.filter((node) => ['episode', 'meaning_change', 'goal', 'current_state'].includes(node.kind)).slice(0, 3);
  const padded = [...stages];
  while (padded.length < 3) padded.push({ id: `unknown-${padded.length}`, kind: 'unknown', title: padded.length === 2 ? 'A meaning still to understand' : 'A detail not yet shared', summary: null, dateLabel: null, payload: {}, lifecycle: 'unknown' });
  const stageIds = new Set(stages.map((node) => node.id));
  const currentConnections = projection.related.filter((node) =>
    ['current_state', 'goal', 'issue'].includes(node.kind) &&
    projection.edges.some((edge) =>
      (edge.fromId === chapter.id || edge.toId === chapter.id || stageIds.has(edge.fromId) || stageIds.has(edge.toId)) &&
      (edge.fromId === node.id || edge.toId === node.id),
    ),
  );
  const unresolvedQuestions = Array.isArray(chapter.payload.unresolvedQuestions)
    ? chapter.payload.unresolvedQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const openQuestion = unresolvedQuestions[0] || 'Which part of this account still feels unresolved?';

  function relationBetween(fromId: string, toId: string) {
    return projection.edges.find((edge) =>
      (edge.fromId === fromId && edge.toId === toId) || (edge.fromId === toId && edge.toId === fromId),
    );
  }

  async function submitCorrection(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/astrologer/profiles/${projection.personId}/changes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'correct_account', clientCommandId: crypto.randomUUID(), expectedRevision: projection.personRevision, targetId: chapter.id, account: { correction } }),
    });
    setSaved(response.ok);
  }

  return (
    <>
      <ProfileTabs personId={projection.personId} />
      <ProjectionNotice state={projection.updateState} />
      <article className="px-5 pb-12 pt-7 md:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-[#687387]"><Link href={`/astrologer/p/${projection.personId}/profile/life-map`}>Life map</Link><span className="mx-3">/</span><span>{chapter.title}</span></nav>
        <h1 className="mt-5 max-w-5xl font-serif text-[42px] leading-[1.08] tracking-[-.025em] md:text-[54px]">{chapter.title}</h1>
        <p className="mt-2 max-w-4xl text-lg text-[#40516d]">{chapter.summary || 'What stayed with you, what challenged it, and what remains unresolved.'}</p>
        <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_300px]">
          <section aria-labelledby="meaning-stages" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <h2 id="meaning-stages" className="sr-only">Meaning change stages</h2>
            {padded.map((node, index) => (
              <div key={node.id} className="contents">
                <div className={`rounded-md p-5 ${index === 0 ? 'bg-[#edf3f6]' : index === 1 ? 'bg-[#f4f0e9]' : 'bg-[#eef4ed]'}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[.18em]">{node.dateLabel || (index === 2 ? 'Changed meaning' : 'Date not specified')}</p>
                  <h3 className="mt-2 font-serif text-2xl leading-tight">{node.title}</h3>
                  <p className="mt-5 rounded-md bg-white/65 p-4 font-serif text-lg leading-7">{node.summary || (index === 2 ? 'This part remains unknown. It has not been filled with an inference.' : 'No supporting account has been added yet.')}</p>
                  {index === 2 ? <div className="mt-5 rounded-md border border-dashed border-[#7c9879] p-4"><strong>Still to understand</strong><p className="mt-2 text-sm leading-6">{openQuestion}</p></div> : null}
                </div>
                {index < 2 ? <div className="flex flex-col items-center justify-center gap-1 text-center"><ArrowRight aria-hidden className="mx-auto rotate-90 md:rotate-0" />{stages[index] && stages[index + 1] ? <span className="max-w-24 text-[10px] leading-4 text-[#687387]">{relationBetween(stages[index].id, stages[index + 1].id)?.label || 'Next account'}</span> : null}</div> : null}
              </div>
            ))}
          </section>
          <aside className="rounded-md border-l border-[#ded9d0] bg-[#f8f7f3] px-5 py-5 md:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#687387]">Present-day connection</p>
            <h2 className="mt-2 font-serif text-2xl">How it reaches your life now</h2>
            {currentConnections.length ? <ul className="mt-4 space-y-4">{currentConnections.map((node) => {
              const relation = projection.edges.find((edge) =>
                (edge.fromId === node.id && (stageIds.has(edge.toId) || edge.toId === chapter.id)) ||
                (edge.toId === node.id && (stageIds.has(edge.fromId) || edge.fromId === chapter.id)),
              );
              return <li key={node.id} className="border-l-2 border-[#9ba98e] pl-3"><h3 className="font-medium text-[#173e67]">{node.title}</h3>{relation?.label ? <p className="mt-1 text-xs text-[#687387]">{relation.label}</p> : null}{node.summary ? <p className="mt-2 text-sm leading-6 text-[#40516d]">{node.summary}</p> : null}</li>;
            })}</ul> : <p className="mt-3 leading-7 text-[#40516d]">No present-day connection is linked to these accounts in this revision.</p>}
            <hr className="my-7" />
            <h2 className="font-serif text-2xl">A connection to explore</h2>
            <p className="mt-3 leading-7 text-[#40516d]">{openQuestion}</p>
            {projection.mode === 'astrology' ? <button type="button" className="mt-7 flex w-full items-center justify-between border-t pt-5 text-left text-sm text-[#9b642c]">Explore the astrological connection <ChevronDown /></button> : null}
          </aside>
        </div>
        <section className="mt-8 rounded-md bg-[#f5f0e8] px-6 py-6 md:px-8">
          <h2 className="font-serif text-3xl">Continue from this turning point</h2>
          <p className="mt-1 text-[#40516d]">{openQuestion}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3"><ExploreInChatButton personId={projection.personId} objectId={chapter.id} personRevision={projection.personRevision} className="bg-[#12375e]" /><button type="button" onClick={() => setCorrecting(true)} className="rounded-md border border-[#718097] px-5 py-3 text-sm">Add what changed</button><button type="button" onClick={() => setCorrecting(true)} className="px-3 py-3 text-sm underline underline-offset-4">Correct this account</button></div>
          <p className="mt-5 text-right text-xs text-[#687387]">Built from what you shared. Open to revision.</p>
        </section>
        <SourceDrawer node={chapter} sources={projection.sources} />
      </article>
      {correcting ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-[#0b2038]/30 p-4"><form onSubmit={submitCorrection} className="w-full max-w-lg rounded-md bg-[#fbfaf6] p-7"><h2 className="font-serif text-3xl">Revise this account</h2><p className="mt-2 text-sm text-[#687387]">Your correction is stored as a new source account. The previous revision remains in history.</p><label className="mt-5 block text-sm font-medium">What should change?<textarea required value={correction} onChange={(e) => setCorrection(e.target.value)} className="mt-2 min-h-28 w-full rounded-md border bg-white p-3 font-normal" /></label>{saved ? <p role="status" className="mt-3 text-sm">Saved. The affected view is updating.</p> : null}<div className="mt-5 flex gap-3"><button className="rounded-md bg-[#12375e] px-5 py-3 text-sm font-semibold text-white" type="submit">Save correction</button><button type="button" onClick={() => setCorrecting(false)} className="px-4 py-3 text-sm">Close</button></div></form></div> : null}
    </>
  );
}
