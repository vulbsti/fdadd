import Reveal from './Reveal';

/**
 * ConnectionChain — the film's chain of real events, drawn the same way:
 * one dot per event, one gold thread running through all of them, ending
 * at a single person. Each link is a true cause of the next.
 */

const LINKS = [
  { when: 'Before the Earth', what: 'A star dies.', why: 'Its silicon is scattered into the cloud our planet forms from.' },
  { when: 'Every day', what: 'That silicon becomes a wafer.', why: 'Grown, sliced and etched into the chips in every phone.' },
  { when: '2006', what: 'Machines learn to learn.', why: 'A paper on deep belief nets restarts neural networks.' },
  { when: '2026', what: 'A new chip is held up on a stage.', why: 'Built to run what that idea became.' },
  { when: 'This year', what: 'The world wants all of them.', why: 'Data centres buy memory faster than it can be made.' },
  { when: 'This season', what: 'Memory prices nearly double.', why: 'Every device with a chip in it costs more.' },
  { when: 'This month', what: 'Her phone costs more.', why: 'The money has to come from somewhere.' },
  { when: 'This week', what: 'A ticket home, not bought.', why: 'A choice that felt like hers alone.' },
  { when: 'Tonight', what: 'She is standing here.', why: 'Where every one of those paths meets.' },
];

export default function ConnectionChain() {
  return (
    <ol className="relative mx-auto max-w-2xl">
      {/* The thread */}
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-[11px] top-3 w-px bg-gradient-to-b from-gold/20 via-gold/70 to-gold-bright md:left-1/2"
      />
      {LINKS.map((link, i) => {
        const isLast = i === LINKS.length - 1;
        const right = i % 2 === 1;
        return (
          <li key={link.what} className="relative pb-10 last:pb-0">
            <Reveal delay={60}>
              <div className={`flex items-start gap-5 md:w-1/2 ${right ? 'md:ml-auto md:pl-10' : 'md:flex-row-reverse md:pr-10 md:text-right'}`}>
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-1.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border md:absolute md:left-1/2 md:-translate-x-1/2 ${
                    isLast ? 'border-gold-bright bg-gold-bright/20' : 'border-gold/60 bg-voyage'
                  }`}
                >
                  <span className={`rounded-full ${isLast ? 'h-2.5 w-2.5 animate-pulse bg-gold-bright' : 'h-1.5 w-1.5 bg-gold'}`} />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-voyage-foreground/50">
                    {link.when}
                  </p>
                  <p className={`mt-1 font-serif text-xl ${isLast ? 'text-gold-bright' : 'text-voyage-foreground'}`}>
                    {link.what}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-voyage-foreground/60">{link.why}</p>
                </div>
              </div>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}
