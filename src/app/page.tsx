import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Hero from '@/components/voyage/Hero';
import Reveal from '@/components/voyage/Reveal';
import ConstellationMap from '@/components/voyage/ConstellationMap';
import BeginButton from '@/components/voyage/BeginButton';

const LENSES = [
  {
    name: 'Mind',
    field: 'Neuroscience',
    body:
      'How you decide, what drives you, and what quietly holds you back. Once you can see your own patterns, you can work with them, so what you do finally lines up with what you want.',
  },
  {
    name: 'Stars',
    field: 'Astrology',
    body:
      'Your Vedic birth chart is an ancient map of temperament and timing. We read it as a lens on your nature and the seasons of your life, and check it against what has actually happened to you.',
  },
  {
    name: 'World',
    field: 'Economics',
    body:
      'From global markets to your monthly budget. See how events on the other side of the world find their way into your work, your money and your plans.',
  },
  {
    name: 'People',
    field: 'Social psychology',
    body:
      'The people around you shape what feels possible. Understand the relationships and circles that pull on you, and in which direction.',
  },
  {
    name: 'Place',
    field: 'Ecology',
    body:
      'You live inside larger systems: the places, communities and rhythms that sustain you or drain you. See where you fit, and what helps you grow.',
  },
];

const WHAT_YOU_GET = [
  {
    title: 'A conversation that knows you',
    body:
      'Talk to it the way you would talk to someone who truly knows you. It remembers what you share and builds on it, so you never start from zero.',
  },
  {
    title: 'Your life map',
    body: 'The chapters and turning points of your life, laid out so you can see how you got here.',
  },
  {
    title: 'Your patterns',
    body: 'The loops you keep repeating, what sets them off, and what breaks them.',
  },
  {
    title: 'Your people',
    body: 'The relationships that shape you, and how each one pulls on you.',
  },
  {
    title: 'Paths ahead',
    body: 'The choices in front of you, played forward, so you can see where each might lead before you take it.',
  },
];

const STEPS = [
  {
    title: 'Tell it when and where you were born.',
    body: 'That is enough for a first sketch of you.',
  },
  {
    title: 'Talk about your life.',
    body:
      'What happened, what you want, what keeps getting in the way. Bring old notes and past AI chats if you like.',
  },
  {
    title: 'Watch the picture sharpen.',
    body: 'Every conversation adds detail, and the picture changes when the evidence does.',
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />

      {/* ---- Why ------------------------------------------------------------------- */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-gold">Why Aidoraa</p>
            <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              A life is more than effort.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Some seasons, everything lands. Others, nothing does, however hard you push.
              That is not only about discipline. How your mind works, the people around you,
              the economy you live in, the rhythm of your own life: all of it is moving with
              you or against you, and most of it out of sight.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Each of these has been studied for a long time, but always on its own.
              Nobody has put them together around one person. That is what we do.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---- Lenses ------------------------------------------------------------------- */}
      <section id="lenses" className="scroll-mt-16 bg-secondary/50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
              One picture, many lenses
            </p>
            <h2 className="mx-auto mt-4 max-w-3xl text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Everything that shapes you, in one place
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <ConstellationMap />
          </Reveal>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {LENSES.map((lens, i) => (
              <Reveal key={lens.name} delay={i * 80}>
                <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    {lens.field}
                  </p>
                  <h3 className="mt-2 font-serif text-2xl font-bold text-foreground">{lens.name}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{lens.body}</p>
                </div>
              </Reveal>
            ))}
            <Reveal delay={LENSES.length * 80}>
              <div className="flex h-full items-center rounded-lg border border-gold/30 bg-gold/5 p-6">
                <p className="font-serif text-xl leading-relaxed text-foreground">
                  No single lens holds the answer. The understanding comes from how they connect,
                  and you are where they meet.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- The product ------------------------------------------------------------------ */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            What you get
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            A guide that knows your whole story
          </h2>
          <p className="mx-auto mb-12 mt-4 max-w-2xl text-center text-lg text-muted-foreground">
            Aidoraa is someone to think with. The more you share, the clearer the picture of
            your life becomes, and the more useful its answers get.
          </p>
        </Reveal>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
          {WHAT_YOU_GET.map((item, i) => (
            <Reveal key={item.title} delay={i * 80}>
              <div className="flex gap-4">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />
                <div>
                  <h3 className="font-serif text-xl font-bold text-foreground">{item.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- How it begins ------------------------------------------------------------------ */}
      <section className="bg-secondary/50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
              How it begins
            </p>
            <h2 className="mb-12 mt-4 text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Three steps to a clearer picture
            </h2>
          </Reveal>
          <ol className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <li className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <span className="font-serif text-3xl text-gold">{i + 1}</span>
                  <h3 className="mt-3 font-serif text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
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
            <h2 className="mx-auto max-w-3xl font-serif text-3xl font-bold leading-snug tracking-tight text-voyage-foreground md:text-5xl">
              You were never moving alone.
              <span className="block text-gold-bright">Now you can see what moves with you.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-voyage-foreground/70">
              Start with your birth chart. Stay for the whole picture.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <BeginButton />
              <Link
                href="/mission"
                className="inline-flex items-center gap-1 text-sm font-medium text-voyage-foreground/80 transition-colors hover:text-gold-bright"
              >
                Read our mission <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
