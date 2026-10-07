import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Hero from '@/components/voyage/Hero';
import Reveal from '@/components/voyage/Reveal';
import ConnectionChain from '@/components/voyage/ConnectionChain';
import BeginButton from '@/components/voyage/BeginButton';

const REFRAIN = [
  'Some days everything lands',
  'Effort is only half of it',
  'The other half is alignment',
  'Everything connects',
  'You are where it all meets',
];

const METHOD = [
  {
    step: 'I',
    title: 'Your chart',
    body:
      'Your Vedic birth chart is calculated once, from the date, time and place you were born: the planets, the houses, and the dasha periods that set the timing of your life. It is stored, so every conversation starts from the same ground.',
  },
  {
    step: 'II',
    title: 'Your story',
    body:
      'Then you talk. What happened, when, and how it felt. You can bring notes and past AI conversations too. Every conversation is kept and searchable, because your own life is the evidence.',
  },
  {
    step: 'III',
    title: 'A theory of you',
    body:
      'Aidoraa joins the two into an understanding of who you are and why your life has moved the way it has. When new evidence breaks that understanding, it changes. When your chart and your life disagree, it says so.',
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />

      {/* ---- Refrain strip ---------------------------------------------------- */}
      <div className="overflow-hidden border-y border-border/60 bg-secondary/40 py-5">
        <div className="marquee-track flex w-max items-center gap-10 whitespace-nowrap">
          {[...REFRAIN, ...REFRAIN].map((line, i) => (
            <span key={i} className="flex items-center gap-10 text-sm uppercase tracking-[0.3em] text-muted-foreground">
              {line}
              <span className="text-gold" aria-hidden="true">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---- The days ------------------------------------------------------------ */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            Alignment
          </p>
          <h2 className="mx-auto mb-12 mt-4 max-w-3xl text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            You have seen people work a hundred times harder, a hundred times smarter,
            and still never arrive.
          </h2>
        </Reveal>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-lg border border-gold/30 bg-gold/5 p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">Some days</p>
              <p className="mt-4 font-serif text-xl leading-relaxed text-foreground">
                The weather holds. The deadline moves. The right call comes at the right
                time. You are not even trying very hard, and the world leans toward you.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="h-full rounded-lg border border-border bg-card p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Other days</p>
              <p className="mt-4 font-serif text-xl leading-relaxed text-foreground">
                You do everything right and nothing lands. You sit down to begin, and the
                phone rings. The train leaves without you. The plan comes apart in your hands.
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <p className="mx-auto mt-12 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground">
            Discipline helps. But effort is only half of it. The other half is alignment:
            whether the world is moving with you, or against you.
          </p>
        </Reveal>
      </section>

      {/* ---- The chain ---------------------------------------------------------------- */}
      <section className="bg-voyage py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold-bright/90">
              Everything connects
            </p>
            <h2 className="mx-auto mb-4 mt-4 max-w-3xl text-center font-serif text-3xl font-bold tracking-tight text-voyage-foreground md:text-4xl">
              A star that died before the Earth was born is in the phone in your hand.
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-voyage-foreground/70">
              Follow one real chain far enough and it reaches you. Change any link in it,
              and you are someone else, standing somewhere else.
            </p>
          </Reveal>
          <ConnectionChain />
        </div>
      </section>

      {/* ---- The old names --------------------------------------------------------------- */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            Fate · Karma · Luck · The stars
          </p>
          <h2 className="mx-auto mb-6 mt-4 max-w-3xl text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            People have always felt this. They only half understood it.
          </h2>
          <p className="mx-auto max-w-2xl text-center text-lg leading-relaxed text-muted-foreground">
            Most of what grew from those names sounds like snake oil, and much of it is.
            Astrology is the oldest and most detailed of them: a map of timing, written
            down over thousands of years. We use it as our method, and we hold it to first
            principles. What your chart says is a hypothesis. Your life is how we test it.
          </p>
        </Reveal>
      </section>

      {/* ---- How Aidoraa reads you ---------------------------------------------------------- */}
      <section className="bg-secondary/50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
              How it works
            </p>
            <h2 className="mb-12 mt-4 text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Your chart, your story, and what joins them
            </h2>
          </Reveal>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            {METHOD.map((item, i) => (
              <Reveal key={item.title} delay={i * 120}>
                <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <p className="font-serif text-sm text-gold">{item.step}</p>
                  <h3 className="mt-2 font-serif text-2xl font-bold">{item.title}</h3>
                  <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
              If your birth time looks wrong against what you tell it, Aidoraa will suggest
              checking it with you before it changes anything.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- Closing ------------------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-voyage py-24 md:py-32">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 110%, hsl(38 55% 52% / 0.18), transparent 70%)',
          }}
        />
        <div className="container relative z-10 mx-auto px-4 text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-gold-bright/90">
              Where it all meets
            </p>
            <h2 className="mx-auto mt-6 max-w-3xl font-serif text-3xl font-bold leading-snug tracking-tight text-voyage-foreground md:text-5xl">
              “I used to think that made me small.
              <span className="block text-gold-bright">It doesn’t. I am where it all meets.”</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-voyage-foreground/70">
              Every path that ever was is the path that led to you. Aidoraa traces the
              ones that brought you here, and the ones that lead on.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <BeginButton />
              <Link
                href="/mission"
                className="inline-flex items-center gap-1 text-sm font-medium text-voyage-foreground/80 transition-colors hover:text-gold-bright"
              >
                Why we are building this <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
