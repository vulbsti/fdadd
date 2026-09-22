import Link from 'next/link';
import { ArrowRight, Compass, RefreshCw } from 'lucide-react';

export function EmptyProjection({ personId, heading, body }: { personId: string; heading: string; body: string }) {
  return (
    <section className="mx-auto flex min-h-[560px] max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="mb-7 grid h-14 w-14 place-items-center rounded-full bg-[#e8eadc] text-[#31544c]"><Compass /></span>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#66738a]">A beginning, not a blank to fill</p>
      <h1 className="max-w-2xl font-serif text-4xl leading-tight text-[#102d53] md:text-5xl">{heading}</h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#506078]">{body}</p>
      <Link href={`/astrologer/p/${personId}/profile/life-map?add=turning-point`} className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#12375e] px-5 py-3 text-sm font-semibold text-white">
        Add a turning point <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function ProjectionNotice({ state }: { state: 'current' | 'updating' | 'failed' }) {
  if (state === 'current') return null;
  return (
    <div role={state === 'failed' ? 'alert' : 'status'} className="flex items-center gap-2 border-b border-[#ded9d0] bg-[#f7f1e8] px-6 py-2 text-xs text-[#635d52]">
      <RefreshCw className={state === 'updating' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
      {state === 'updating' ? 'Your understanding is updating. This view remains on the last complete revision.' : 'The latest update could not be completed. This is the last valid view.'}
    </div>
  );
}
