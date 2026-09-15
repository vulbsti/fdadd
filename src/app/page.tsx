import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { getBlogPosts } from '@/services/blog';
import Hero from '@/components/voyage/Hero';
import ConstellationMap from '@/components/voyage/ConstellationMap';
import Reveal from '@/components/voyage/Reveal';

const MANIFESTO = [
  'Know thyself',
  'The voyage within',
  'Pioneers of the interior',
  'Journey outward · Journey inward',
  'AI Dora — the grand exploration',
];

const INSTRUMENTS = [
  {
    href: '/fashiondaddy',
    name: 'FashionDaddy',
    role: 'Instrument I — The Mirror',
    description:
      'A personal AI stylist that reads how you present yourself to the world — and refines it until the outside matches the inside.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          {/* hand mirror */}
          <circle cx="60" cy="30" r="18" />
          <circle cx="60" cy="30" r="13" opacity="0.4" />
          <path d="M60 48 L60 66 M54 66 L66 66" />
          {/* starlight glint on glass */}
          <path d="M54 24 l3 3 M66 36 l-3 -3" opacity="0.7" />
        </g>
      </svg>
    ),
  },
  {
    href: '/dateplanner',
    name: 'DatePlanner',
    role: 'Instrument II — The Compass',
    description:
      'Two travellers, one evening. AI charts the course — attire, venue, atmosphere — so the night belongs to the people in it.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          {/* compass rose */}
          <circle cx="60" cy="40" r="22" />
          <path d="M60 20 L65 40 L60 60 L55 40 Z" />
          <path d="M40 40 L60 35 L80 40 L60 45 Z" opacity="0.5" />
          <circle cx="60" cy="40" r="2.5" fill="currentColor" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    href: '/aesthetic-quiz',
    name: 'Aesthetic Quiz',
    role: 'Instrument III — The Sextant',
    description:
      'A short survey that fixes your position: your aesthetic coordinates, plotted from what you are drawn to.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          {/* sextant arc + sight lines */}
          <path d="M35 58 A28 28 0 0 1 85 50" />
          <path d="M35 58 L78 26" />
          <path d="M35 58 L88 44" opacity="0.5" />
          <circle cx="78" cy="26" r="3" />
          <path d="M30 64 L92 64" opacity="0.35" />
        </g>
      </svg>
    ),
  },
];

export default async function Home() {
  const latestPosts = (await getBlogPosts()).slice(0, 3);

  return (
    <div className="flex flex-col">
      <Hero />

      {/* ---- Manifesto strip ---------------------------------------------------- */}
      <div className="overflow-hidden border-y border-border/60 bg-secondary/40 py-5">
        <div className="marquee-track flex w-max items-center gap-10 whitespace-nowrap">
          {[...MANIFESTO, ...MANIFESTO].map((line, i) => (
            <span key={i} className="flex items-center gap-10 text-sm uppercase tracking-[0.3em] text-muted-foreground">
              {line}
              <span className="text-gold" aria-hidden="true">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---- Instruments --------------------------------------------------------- */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
            The Expedition Kit
          </p>
          <h2 className="mb-4 mt-4 text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Instruments for the first leg
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Every voyage starts small. Ours starts with how you appear to others —
            the outermost layer of the self — before descending into everything beneath it.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {INSTRUMENTS.map((tool, i) => (
            <Reveal key={tool.href} delay={i * 120}>
              <Link
                href={tool.href}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-500 hover:-translate-y-1 hover:border-gold/30 hover:shadow-xl"
              >
                <div className="relative flex h-44 items-center justify-center bg-voyage text-gold-bright/90 transition-colors duration-500 group-hover:text-gold-bright">
                  {tool.art}
                  <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(220_40%_10%/0.6)_100%)]" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    {tool.role}
                  </p>
                  <h3 className="mt-2 font-serif text-2xl font-bold">{tool.name}</h3>
                  <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-gold">
                    Board this instrument
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={15} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- Constellation roadmap ------------------------------------------------- */}
      <section className="bg-secondary/50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-gold">
              The Chart Still Being Drawn
            </p>
            <h2 className="mb-4 mt-4 text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              One self, many disciplines
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-center text-muted-foreground">
              Fashion and dating are where we weigh anchor. Health, astrology,
              spirituality, neuroscience, behaviour science — each will become a star
              in a single map of you.
            </p>
          </Reveal>

          <Reveal delay={150}>
            <ConstellationMap />
          </Reveal>

          <Reveal>
            <div className="mt-6 flex items-center justify-center gap-8 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold" /> Live now
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-foreground/40 bg-background" /> On the horizon
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Journal ------------------------------------------------------------------ */}
      {latestPosts.length > 0 && (
        <section className="container mx-auto px-4 py-16 md:py-24">
          <Reveal>
            <h2 className="mb-2 text-center font-serif text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Dispatches from the voyage
            </h2>
            <p className="mx-auto mb-12 max-w-xl text-center text-muted-foreground">
              Field notes on style, self-perception, and the machinery of becoming.
            </p>
          </Reveal>
          <div
            className={`grid grid-cols-1 gap-8 ${
              latestPosts.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
            }`}
          >
            {latestPosts.map((post, i) => (
              <Reveal key={post.id} delay={i * 120}>
                <BlogPostCard post={post} />
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mt-12 text-center">
              <Button asChild variant="outline">
                <Link href="/blog">Read All Dispatches</Link>
              </Button>
            </div>
          </Reveal>
        </section>
      )}

      {/* ---- Closing CTA ------------------------------------------------------------------ */}
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
              The Approach Is Small · The Goal Is Vast
            </p>
            <h2 className="mx-auto mt-6 max-w-3xl font-serif text-3xl font-bold leading-snug tracking-tight text-voyage-foreground md:text-5xl">
              “You are not a passenger on this ship.
              <span className="block text-gold-bright">You are the territory.”</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-voyage-foreground/70">
              From the Buddha to Neo, every tradition of transcendence begins the same
              way: with the decision to look. Start with an outfit. End somewhere
              no map has words for.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="bg-gold text-voyage hover:bg-gold-bright">
                <Link href="/fashiondaddy">
                  Take the First Step <ArrowRight className="ml-2" size={16} />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-voyage-foreground hover:bg-white/10 hover:text-white"
              >
                <Link href="/about">Why We Explore</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
