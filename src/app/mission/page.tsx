import type { Metadata } from 'next';
import Reveal from '@/components/voyage/Reveal';
import BeginButton from '@/components/voyage/BeginButton';

export const metadata: Metadata = {
  title: 'Our Mission — Aidoraa',
  description:
    'We help people understand themselves, and how their lives connect to everything around them, so they can act in step with what they want.',
};

const BELIEFS = [
  {
    title: 'You come first, not the method',
    body:
      'Astrology, neuroscience, economics, psychology, ecology: each is a tool for understanding you. None of them is the truth on its own.',
  },
  {
    title: 'Your life is the evidence',
    body:
      'Every reading is checked against what has actually happened to you, and it changes when it does not fit.',
  },
  {
    title: 'Understanding should lead somewhere',
    body:
      'Insight matters when it helps you act: to decide well, to time things well, and to stop repeating what hurts.',
  },
  {
    title: 'Your story stays yours',
    body: 'What you share is private, and it is used to understand you better. Nothing else.',
  },
];

export default function MissionPage() {
  return (
    <div className="flex flex-col">
      {/* ---- Statement -------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-voyage py-24 md:py-32">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 0%, hsl(38 55% 52% / 0.16), transparent 70%)',
          }}
        />
        <div className="container relative z-10 mx-auto max-w-3xl px-4 text-center">
          <p className="rise-in text-xs font-semibold uppercase tracking-[0.4em] text-gold-bright/90">
            Our mission
          </p>
          <h1 className="rise-in rise-in-d1 mt-6 font-serif text-3xl font-bold leading-tight tracking-tight text-voyage-foreground md:text-5xl">
            We help people understand themselves,
            <span className="block text-gold-bright">and how their lives connect to everything around them.</span>
          </h1>
        </div>
      </section>

      <article className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
        {/* ---- Why -------------------------------------------------------------------- */}
        <Reveal>
          <h2 className="text-xs font-semibold uppercase tracking-[0.4em] text-gold">Why</h2>
          <div className="mt-4 space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p className="font-serif text-2xl leading-relaxed text-foreground">
              People have always sensed that a life is shaped by more than effort.
            </p>
            <p>
              They called it fate, luck, karma, the stars. They were noticing something real,
              but they only ever had part of the picture.
            </p>
            <p>
              We know far more now. The brain runs on patterns we rarely see. A decision in
              one economy changes prices in another. The people around us shape what we
              believe is possible, and the places we live shape how we feel. But that
              knowledge sits in separate fields, written for specialists, and it almost
              never comes back to the one person it is about.
            </p>
          </div>
        </Reveal>

        {/* ---- What we are building ------------------------------------------------------ */}
        <Reveal>
          <h2 className="mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            What we are building
          </h2>
          <div className="mt-4 space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              Aidoraa brings it together around you. We begin with one of the oldest lenses
              there is, your birth chart, because it gives a first sketch of your nature and
              the timing of your life. Then we add what the sciences of mind, society,
              economy and environment can tell us, and test all of it against the best
              evidence there is: your own story.
            </p>
            <p>
              The goal is not prediction for its own sake. It is alignment. When you
              understand how you work and what is moving around you, you can choose actions
              that move with your life instead of against it.
            </p>
          </div>
        </Reveal>

        {/* ---- Beliefs -------------------------------------------------------------------- */}
        <Reveal>
          <h2 className="mb-6 mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            What we believe
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {BELIEFS.map((b) => (
              <div key={b.title} className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-serif text-xl font-bold text-foreground">{b.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </article>

      {/* ---- Closing -------------------------------------------------------------------- */}
      <section className="bg-voyage py-20 md:py-28">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <p className="font-serif text-2xl leading-relaxed text-voyage-foreground md:text-3xl">
              Everything that has ever happened led, in some way, to you.
            </p>
            <p className="mt-4 font-serif text-2xl leading-relaxed text-gold-bright md:text-3xl">
              We want to help you see it, and choose what comes next.
            </p>
            <div className="mt-10 flex justify-center">
              <BeginButton />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
