'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
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
    <nav
      aria-label="Profile sections"
      className="max-w-full overflow-x-auto overscroll-x-contain border-b border-[#ded9d0] px-5 focus-within:scroll-auto md:px-10"
    >
      <div className="flex w-max min-w-full gap-5 sm:gap-8">
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
              'shrink-0 whitespace-nowrap border-b-2 px-1 py-4 text-[15px] text-[#40516d] transition-colors hover:text-[#0b2c54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b07a32]',
              active ? 'border-[#b07a32] font-semibold text-[#0b2c54]' : 'border-transparent',
            )}
          >
            {label}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
