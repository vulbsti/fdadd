'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/global/Header';
import Footer from '@/components/global/Footer';

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAstrologerWorkspace = pathname.startsWith('/astrologer');

  if (isAstrologerWorkspace) {
    return <main className="min-h-dvh">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
