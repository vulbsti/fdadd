import Link from 'next/link';
import { ArrowRight, Users, Waypoints } from 'lucide-react';
import { ProfileTabs } from './ProfileTabs';
import { EmptyProjection, ProjectionNotice } from './ProjectionState';
import type { PersonProjection, ViewNode } from './types';

function hrefFor(personId: string, node: ViewNode): string {
  const segment = node.kind === 'pattern' ? 'patterns' : node.kind === 'scenario' ? 'paths' : 'people';
  return `/astrologer/p/${personId}/profile/${segment}/${node.id}`;
}

const copy = {
  patterns: ['How you think', 'Working patterns, their conditions, and the exceptions that can change them.'],
  people: ['People & influences', 'Relationships and environments shown through experiences you reported.'],
  paths: ['Paths ahead', 'Conditional directions connected to current goals — possibilities, not predictions.'],
} as const;

export default function ProfileCollectionView({ projection }: { projection: PersonProjection }) {
  const [heading, subtitle] = copy[projection.view as keyof typeof copy] ?? [projection.title, projection.subtitle ?? ''];
  if (projection.nodes.length === 0) {
    return <><ProfileTabs personId={projection.personId} /><ProjectionNotice state={projection.updateState} /><EmptyProjection personId={projection.personId} heading={`No ${heading.toLowerCase()} have been established yet.`} body="This area stays sparse until your own accounts support something useful to show." /></>;
  }
  return (
    <>
      <ProfileTabs personId={projection.personId} />
      <ProjectionNotice state={projection.updateState} />
      <div className="px-5 py-8 md:px-10">
        <h1 className="font-serif text-[44px] leading-tight tracking-[-.02em] md:text-[54px]">{heading}</h1>
        <p className="mt-2 max-w-3xl text-lg leading-7 text-[#40516d]">{subtitle}</p>
        <ul className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projection.nodes.map((node) => (
            <li key={node.id}>
              <Link href={hrefFor(projection.personId, node)} className="group flex min-h-56 flex-col rounded-md border border-[#ded9d0] bg-white/35 p-6 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b07a32]">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e7eadf] text-[#34594e]">{projection.view === 'people' ? <Users /> : <Waypoints />}</span>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[.18em] text-[#687387]">{node.kind.replace('_', ' ')}</p>
                <h2 className="mt-2 font-serif text-2xl leading-tight">{node.title}</h2>
                {node.summary ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#52627a]">{node.summary}</p> : null}
                <span className="mt-auto flex items-center gap-2 pt-6 text-sm text-[#a2632c]">Open detail <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
