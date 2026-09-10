'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VoyageCanvas from './VoyageCanvas';
import IntroVeil from './IntroVeil';

/**
 * Hero — full-viewport window into the voyage. Owns the scene-ready state
 * that lifts the intro veil, so the reveal is tied to actual first render,
 * not a guess about WebGL timing.
 */
export default function Hero() {
  const [sceneReady, setSceneReady] = useState(false);

  return (
    <section className="relative min-h-[640px] w-full overflow-hidden bg-voyage">
      <div className="absolute inset-0">
        <VoyageCanvas onReady={() => setSceneReady(true)} />
        {/* Vignette so type always wins over particles */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_48%,hsl(220_40%_10%/0.7)_100%)]" />
      </div>
      <div className="container relative z-10 mx-auto flex min-h-[640px] flex-col items-center justify-center px-4 pb-24 pt-28 text-center md:min-h-screen">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 z-[-1] h-[140%] -translate-y-1/2 bg-[radial-gradient(ellipse_52%_42%_at_50%_50%,hsl(220_40%_10%/0.72),transparent_68%)]"
        />
        <p className="rise-in mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.45em] text-gold-bright/90">
          <Compass size={13} aria-hidden="true" />
          AI Dora · The Grand Form of Exploration
        </p>

        <h1 className="rise-in rise-in-d1 max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-voyage-foreground md:text-6xl">
          Every great expedition
          <span className="block text-gold-bright">began as a question.</span>
        </h1>

        <p className="rise-in rise-in-d2 mt-6 max-w-2xl text-lg leading-relaxed text-voyage-foreground/75">
          Aidoraa is an instrument for the oldest journey there is — the one inward.
          We are pioneers and travellers, using AI to map the self the way maps were
          once drawn of the stars.
        </p>

        <div className="rise-in rise-in-d3 mt-10 flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="bg-gold text-voyage hover:bg-gold-bright">
            <Link href="/fashiondaddy">
              Begin the Voyage <ArrowRight className="ml-2" size={16} />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/25 bg-transparent text-voyage-foreground hover:bg-white/10 hover:text-white"
          >
            <Link href="/aesthetic-quiz">Chart Your Aesthetic</Link>
          </Button>
        </div>
      </div>

      {/* Scroll invitation */}
      <div className="rise-in rise-in-d3 absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="mb-3 text-[10px] uppercase tracking-[0.4em] text-voyage-foreground/50">
          Scroll to embark
        </p>
        <div className="mx-auto h-12 w-px overflow-hidden bg-white/15">
          <div className="h-full w-full origin-top animate-pulse bg-gold-bright/70" />
        </div>
      </div>

      <IntroVeil lifted={sceneReady} />
    </section>
  );
}
