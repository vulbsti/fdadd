'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { SourceEvidence, ViewNode } from './types';

function epistemicLabel(node: ViewNode): string {
  if (node.epistemicClass === 'reported') return 'Reported account';
  if (node.epistemicClass === 'working_hypothesis') return 'Working explanation';
  if (node.epistemicClass === 'unknown') return 'Still unknown';
  if (node.epistemicClass === 'calculated') return 'Calculated layer';
  if (node.epistemicClass === 'interpretation') return 'Interpretation';
  return 'Source-backed account';
}

function sourceLabel(source: SourceEvidence): string {
  const date = source.sourceTime
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(source.sourceTime))
    : 'Date not specified';
  const relation = source.relation === 'qualifies'
    ? 'qualifying account'
    : source.relation === 'contradicts'
      ? 'counterevidence'
      : source.relation === 'supports'
        ? 'supporting account'
        : 'unclassified source link';
  return `${date} · ${relation}`;
}

export default function SourceDrawer({ node, sources }: { node: ViewNode; sources: SourceEvidence[] }) {
  const [open, setOpen] = useState(false);
  const sourcesWithSpecificEvidence = new Set(sources
    .filter((source) => source.observationId || source.exactQuote || source.assertionType !== 'unknown')
    .map((source) => source.sourceId));
  // A version is linked both to its source item and to its extracted
  // observations. When a specific observation exists, hide the redundant
  // source-only row rather than presenting it as vague positive evidence.
  const displayedSources = sources.filter((source) => source.observationId
    || source.exactQuote
    || source.assertionType !== 'unknown'
    || !sourcesWithSpecificEvidence.has(source.sourceId));
  const linkedSourceCount = new Set(displayedSources.map((source) => source.sourceId)).size;
  return (
    <section className="mt-7 rounded-md border border-[#ded9d0] bg-[#fbfaf7]" aria-labelledby="source-drawer-title">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#284b6d]"
      >
        <span className="flex items-center gap-3"><BookOpen aria-hidden className="h-4 w-4" /><span><strong id="source-drawer-title" className="block">Why this appears</strong><span className="text-xs text-[#687387]">{epistemicLabel(node)} · {linkedSourceCount} linked source {linkedSourceCount === 1 ? 'account' : 'accounts'} · {displayedSources.length} evidence {displayedSources.length === 1 ? 'link' : 'links'}</span></span></span>
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="border-t px-5 py-5">
          {displayedSources.length ? <ol className="space-y-5">{displayedSources.map((source, index) => (
            <li key={source.supportId ?? `${source.sourceId}:${source.observationId ?? source.relation}:${index}`} className="border-l-2 border-[#91a0ad] pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#687387]">{sourceLabel(source)}</p>
              {source.exactQuote && source.assertionType === 'direct' && source.speaker === 'user'
                ? <blockquote className="mt-2 font-serif text-lg leading-7 text-[#233f5f]">“{source.exactQuote}”</blockquote>
                : <p className="mt-2 text-sm leading-6 text-[#52627a]">This link is a {source.assertionType.replaceAll('_', ' ')}. It is not presented as your exact words.</p>}
              <p className="mt-2 text-xs text-[#687387]">Subject: {source.subjectKind === 'self' ? 'you' : source.subjectKind}</p>
            </li>
          ))}</ol> : <p className="text-sm leading-6 text-[#687387]">No eligible source link is available for this version. Treat it as unconfirmed.</p>}
        </div>
      ) : null}
    </section>
  );
}
