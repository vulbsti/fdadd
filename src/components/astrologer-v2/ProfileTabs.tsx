'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  ['Life map', 'life-map'],
  ['How you think', 'patterns'],
  ['People & influences', 'people'],
  ['Paths ahead', 'paths'],
] as const;

export function ProfileTabs({ personId }: { personId: string }) {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // Keep the current destination visible after client navigation on narrow screens.
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <div className="relative border-b border-[#ded9d0]">
      <nav
        aria-label="Profile sections"
        className="mr-7 max-w-full overflow-x-auto overscroll-x-contain px-5 focus-within:scroll-auto md:mr-0 md:px-10"
      >
        <div className="flex w-max min-w-full gap-4 sm:gap-8">
        {tabs.map(([label, slug]) => {
          const href = `/astrologer/p/${personId}/profile/${slug}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={slug}
              ref={active ? activeTabRef : undefined}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap border-b-2 px-1 py-4 text-sm text-[#40516d] transition-colors hover:text-[#0b2c54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b07a32] sm:text-[15px]',
                active ? 'border-[#b07a32] font-semibold text-[#0b2c54]' : 'border-transparent',
              )}
            >
              {label}
            </Link>
          );
        })}
        </div>
      </nav>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-7 items-center justify-center bg-background text-[#687387] md:hidden">
        <ChevronRight className="h-4 w-4" />
      </span>
    </div>
  );
}
