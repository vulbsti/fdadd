'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CirclePlus, Moon, X } from 'lucide-react';
import { ProfileTabs } from './ProfileTabs';
import { EmptyProjection, ProjectionNotice } from './ProjectionState';
import type { PersonProjection, ViewNode } from './types';

function payloadText(node: ViewNode, key: string): string | null {
  const value = node.payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function objectHref(personId: string, node: ViewNode): string {
  if (node.kind === 'chapter') return `/astrologer/p/${personId}/profile/life-map/chapters/${node.id}`;
  if (node.kind === 'pattern') return `/astrologer/p/${personId}/profile/patterns/${node.id}`;
  if (node.kind === 'scenario') return `/astrologer/p/${personId}/profile/paths/${node.id}`;
  return `/astrologer/p/${personId}/profile/life-map/episodes/${node.id}`;
}

export default function LifeMapView({ projection }: { projection: PersonProjection }) {
  const [adding, setAdding] = useState(false);
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [changed, setChanged] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const events = projection.nodes.filter((node) => ['episode', 'meaning_change', 'chapter', 'goal', 'current_state'].includes(node.kind));
  const pastEvents = events.filter((node) => node.kind !== 'current_state').slice(0, 6);
  const presentStates = events.filter((node) => node.kind === 'current_state').slice(0, 3);
  const scenarios = projection.nodes.filter((node) => node.kind === 'scenario').slice(0, 3);
  const invitations = projection.nodes.filter((node) => ['gap', 'pattern', 'issue'].includes(node.kind)).slice(0, 2);
  const compactPastTimeline = pastEvents.length <= 3;

  async function submitTurningPoint(event: React.FormEvent) {
    event.preventDefault();
    setStatus('Saving…');
    const response = await fetch(`/api/astrologer/profiles/${projection.personId}/changes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'add_event',
        clientCommandId: crypto.randomUUID(),
        expectedRevision: projection.personRevision,
        account: { what, when: when || null, whatChanged: changed || null },
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setStatus(body?.message ?? 'Could not save this turning point.');
      return;
    }
    setStatus('Saved. Your map is updating.');
    setWhat(''); setWhen(''); setChanged('');
  }

  return (
    <>
      <ProfileTabs personId={projection.personId} />
      <ProjectionNotice state={projection.updateState} />
      {events.length === 0 && scenarios.length === 0 ? (
        <EmptyProjection personId={projection.personId} heading="Your life map starts with what you choose to share." body="Add one experience that changed what mattered to you. A birth date is not required, and unknown details can stay unknown." />
      ) : (
        <div className="px-5 pb-10 pt-7 md:px-10">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <h1 className="font-serif text-[42px] leading-[1.05] tracking-[-0.025em] text-[#102d53] md:text-[54px]">{projection.title || 'The life behind your choices'}</h1>
              <p className="mt-2 text-lg text-[#40516d]">{projection.subtitle || 'Follow the moments that changed what mattered to you.'}</p>
            </div>
            <p className="pt-2 text-xs text-[#687387]">Revision {projection.personRevision} · {projection.mode === 'astrology' ? 'Astrology layer on' : 'Personal only'}</p>
          </div>

          <section aria-labelledby="life-map-heading" className="mt-8 overflow-hidden rounded-md border border-[#dcd6cc] bg-[#fefdf9]">
            <h2 id="life-map-heading" className="sr-only">Life map timeline</h2>
            <div className="grid border-b border-[#ded9d0] text-center text-[#27476b] md:grid-cols-[1.6fr_1fr_1fr]">
              <div className="px-4 py-4"><b className="text-[11px] uppercase tracking-[.24em]">What shaped you</b><p className="mt-1 text-xs">Experiences, questions and influences.</p></div>
              <div className="border-l border-[#ded9d0] px-4 py-4"><b className="text-[11px] uppercase tracking-[.24em]">Where you are</b><p className="mt-1 text-xs">The present and how it came together.</p></div>
              <div className="border-l border-[#ded9d0] px-4 py-4"><b className="text-[11px] uppercase tracking-[.24em]">Paths you could take</b><p className="mt-1 text-xs">Possible directions, not predictions.</p></div>
            </div>
            <div className="grid min-h-[300px] md:grid-cols-[2.6fr_1fr]">
              <div className="grid content-start divide-y divide-[#ded9d0] md:grid-cols-[minmax(0,1.7fr)_minmax(210px,1fr)] md:divide-x md:divide-y-0">
                <section aria-labelledby="past-events-heading" className="min-w-0 px-6 py-7 md:px-7">
                  <h3 id="past-events-heading" className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#62728a]">What shaped you</h3>
                  {pastEvents.length ? (
                    <div
                      aria-label="Earlier experiences timeline. Scroll horizontally for more."
                      className={`mt-7 md:pb-3 ${compactPastTimeline ? 'md:overflow-visible' : 'md:overflow-x-auto'}`}
                      role="region"
                      tabIndex={0}
                    >
                      <ol aria-label="Earlier experiences, in chronological order" className={`relative flex flex-col gap-5 border-l border-[#9ca9b6] pl-4 md:min-w-full md:gap-0 md:border-0 md:pl-0 md:pt-6 ${compactPastTimeline ? 'md:grid md:grid-cols-3' : 'md:w-max md:flex-row'}`}>
                        <span aria-hidden className="absolute left-2 right-2 top-[6px] hidden h-px bg-[#163e67] md:block" />
                        {pastEvents.map((node) => (
                          <li key={node.id} className={`relative w-full min-w-0 pb-1 md:px-3 md:pb-0 first:md:pl-2 last:md:pr-5 ${compactPastTimeline ? 'md:w-auto' : 'md:w-[132px] md:shrink-0 xl:w-[165px]'}`}>
                            <span aria-hidden className="absolute -left-[21px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[#fefdf9] bg-[#1f4a77] md:left-3 md:top-[-25px]" />
                            <Link href={objectHref(projection.personId, node)} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#b07a32]">
                              <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#173e67]">{node.dateLabel && node.dateLabel.length <= 40 ? node.dateLabel : 'Date not specified'}</span>
                              <strong className="mt-1 block font-serif text-lg leading-tight text-[#112d52]">{node.title}</strong>
                              {node.summary ? <span className="mt-1 block text-sm leading-5 text-[#52627a]">{node.summary}</span> : null}
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : <p className="mt-4 text-sm leading-6 text-[#687387]">No earlier experience has been added to this map yet.</p>}
                </section>
                <section aria-labelledby="present-state-heading" className="px-6 py-7 md:px-7">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-3 w-3 rounded-full border-2 border-[#fefdf9] bg-[#b07a32] ring-1 ring-[#b07a32]" />
                    <h3 id="present-state-heading" className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#62728a]">Where you are</h3>
                  </div>
                  {presentStates.length ? (
                    <ul className="mt-5 space-y-5">
                      {presentStates.map((node) => (
                        <li key={node.id}>
                          <Link href={objectHref(projection.personId, node)} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#b07a32]">
                            <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#173e67]">{node.dateLabel || 'Current account'}</span>
                            <strong className="mt-1 block font-serif text-lg leading-tight text-[#112d52]">{node.title}</strong>
                            {node.summary ? <span className="mt-1 block text-sm leading-5 text-[#52627a]">{node.summary}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 text-sm leading-6 text-[#687387]">A present-day account has not been established yet.</p>}
                </section>
              </div>
              <div className="border-t border-[#ded9d0] px-7 py-8 md:border-l md:border-t-0">
                <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#62728a]">Conditional paths</p>
                <ul className="mt-6 space-y-7">
                  {scenarios.map((node, index) => (
                    <li key={node.id}>
                      <Link href={objectHref(projection.personId, node)} className="group flex gap-3">
                        <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${index === 0 ? 'border-[#678768]' : 'border-[#a57c55]'}`} />
                        <span><strong className="block text-sm font-medium">{node.title}</strong>{node.summary ? <span className="mt-1 block text-xs leading-5 text-[#62728a]">{node.summary}</span> : null}</span>
                      </Link>
                    </li>
                  ))}
                  {scenarios.length === 0 ? <li className="text-sm leading-6 text-[#687387]">No future path has been inferred. Paths appear only when goals and conditions support them.</li> : null}
                </ul>
              </div>
            </div>
            {projection.mode === 'astrology' ? (
              <div className="flex items-center justify-between border-t border-[#d9cdbd] bg-[#f8f1e7] px-6 py-4 text-sm text-[#965f2d]"><span className="flex items-center gap-4"><Moon className="h-5 w-5" /> Astrological context</span><span>Read the periods alongside your life events</span></div>
            ) : null}
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><h2 className="font-serif text-3xl text-[#102d53]">Questions worth exploring</h2><p className="mt-1 text-sm text-[#52627a]">Invitations from gaps or patterns in the current revision.</p></div>
              <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm font-medium text-[#173e67]"><CirclePlus className="h-5 w-5" /> Add a turning point</button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {invitations.map((node) => (
                <Link key={node.id} href={objectHref(projection.personId, node)} className="group min-h-36 rounded-md border border-[#ded9d0] p-6">
                  <h3 className="font-serif text-2xl leading-tight">{payloadText(node, 'candidateQuestion') || node.title}</h3>
                  <span className="mt-6 flex items-center gap-2 text-sm text-[#a2632c]">Explore this connection <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              ))}
              {invitations.length === 0 ? <p className="col-span-2 rounded-md border border-dashed p-6 text-sm text-[#687387]">No open questions yet. The map will not invent one just to fill this space.</p> : null}
            </div>
          </section>
        </div>
      )}
      {adding ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b2038]/30 p-4" role="dialog" aria-modal="true" aria-labelledby="turning-point-title">
          <form onSubmit={submitTurningPoint} className="relative w-full max-w-xl rounded-lg bg-[#fbfaf6] p-7 shadow-2xl">
            <button type="button" aria-label="Close" onClick={() => setAdding(false)} className="absolute right-4 top-4 p-2"><X className="h-5 w-5" /></button>
            <h2 id="turning-point-title" className="font-serif text-3xl">Add a turning point</h2>
            <p className="mt-2 text-sm text-[#58677c]">Share what happened. Dates and meanings can remain uncertain.</p>
            <label className="mt-6 block text-sm font-medium">What happened?<textarea required value={what} onChange={(e) => setWhat(e.target.value)} className="mt-2 min-h-24 w-full rounded-md border bg-white p-3 font-normal" /></label>
            <label className="mt-4 block text-sm font-medium">When? <span className="font-normal text-[#687387]">Optional</span><input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="A year, age, range, or unknown" className="mt-2 h-11 w-full rounded-md border bg-white px-3 font-normal" /></label>
            <label className="mt-4 block text-sm font-medium">What changed? <span className="font-normal text-[#687387]">Optional</span><textarea value={changed} onChange={(e) => setChanged(e.target.value)} className="mt-2 min-h-20 w-full rounded-md border bg-white p-3 font-normal" /></label>
            {status ? <p role="status" className="mt-4 text-sm text-[#58677c]">{status}</p> : null}
            <button type="submit" className="mt-6 rounded-md bg-[#12375e] px-5 py-3 text-sm font-semibold text-white">Save turning point</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
