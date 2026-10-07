import type { Metadata } from 'next';
import Reveal from '@/components/voyage/Reveal';
import BeginButton from '@/components/voyage/BeginButton';

export const metadata: Metadata = {
  title: 'Our Mission — Aidoraa',
  description:
    'Aidoraa exists to help people understand themselves, their lives, and how it all connects, using Vedic astrology tested against the evidence of their own story.',
};

const PRINCIPLES = [
  {
    title: 'Your life is the evidence',
    body:
      'What happened to you, and when, is the most reliable thing we have. Every reading is checked against it, and every conversation you have is kept as part of that record.',
  },
  {
    title: 'The chart is a hypothesis',
    body:
      'Astrology is the method, not the verdict. A placement or a dasha suggests where to look. Whether it holds is decided by your life, not by a book.',
  },
  {
    title: 'Change the theory, not the facts',
    body:
      'Aidoraa keeps an understanding of you and updates it only when something new breaks or sharpens it. When your chart and your life disagree, it tells you, and asks before changing anything.',
  },
  {
    title: 'An attempt, not a promise',
    body:
      'We do not claim to have solved fate. We are trying to find out whether understanding can do better than a guess, and we will say plainly where it cannot.',
  },
];

export default function MissionPage() {
  return (
    <div className="flex flex-col">
      {/* ---- Opening ------------------------------------------------------------------- */}
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
          <h1 className="rise-in rise-in-d1 mt-6 font-serif text-4xl font-bold leading-tight tracking-tight text-voyage-foreground md:text-6xl">
            To help people understand themselves, their lives,
            <span className="block text-gold-bright">and how it all connects.</span>
          </h1>
        </div>
      </section>

      {/* ---- The essay ------------------------------------------------------------------ */}
      <article className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
        <Reveal>
          <div className="space-y-6 font-serif text-xl leading-relaxed text-foreground">
            <p>There are days when everything simply works.</p>
            <p>
              The weather holds. The deadline moves. The right call comes at the right
              time. You are not even trying very hard, and the world seems to lean toward
              you, to pull you forward, and ask for more.
            </p>
            <p>
              And there are days when nothing lands. You do everything right. You sit down
              to begin, and the phone rings. The connection drops. The plan comes apart in
              your hands.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mb-4 mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            Effort is only half of it
          </h2>
          <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              So we tell ourselves what everyone does. Be more disciplined. Try harder.
              Sometimes, that helps.
            </p>
            <p>
              But you have watched people do so much with so little. And you have watched
              others work a hundred times harder, a hundred times smarter, and still stand
              exactly where they were.
            </p>
            <p>
              The other half is alignment: whether the world is moving with you, or
              against you. Nobody moves alone.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mb-4 mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            The old names
          </h2>
          <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              People have always felt this. They called it fate. Karma. Luck. The stars.
              Manifestation.
            </p>
            <p>
              Most of what grew from those names sounds like snake oil, and much of it is.
              Half-finished methods, built on something real that nobody stopped to
              understand.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mb-4 mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            So we stopped, and looked
          </h2>
          <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              Everything does connect. A star that died before the Earth was born is in the
              phone in your hand. An idea spoken in a lecture hall twenty years ago reached
              you this year, through a chip, a price, a choice you thought was yours alone.
              Change any one of them, and your life becomes a different life.
            </p>
            <p>
              Astrology is the oldest and most detailed attempt to read that timing. It is
              a map drawn over thousands of years, by people who watched the sky and the
              lives beneath it. We have gone all in on it as our method, and we take it
              apart from first principles, with everything science knows about how one thing
              moves another.
            </p>
            <p>
              Aidoraa starts from your Vedic birth chart, calculated once and kept. Then it
              listens. Your story, in your words, is held up against the chart, and from the
              two it builds an understanding of who you are and why your life has moved the
              way it has. It traces the paths that led you here, and the ones that lead on
              from here.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="mb-6 mt-16 text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            What we hold to
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-serif text-xl font-bold text-foreground">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </article>

      {/* ---- Closing ------------------------------------------------------------------- */}
      <section className="bg-voyage py-20 md:py-28">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <p className="font-serif text-2xl leading-relaxed text-voyage-foreground md:text-3xl">
              You might think being the result of every path makes you small.
            </p>
            <p className="mt-4 font-serif text-2xl leading-relaxed text-gold-bright md:text-3xl">
              It doesn’t. You are where it all meets.
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
