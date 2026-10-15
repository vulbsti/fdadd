import type { Metadata } from 'next';
import { DrivePickHandoff } from '@/components/account/DrivePickHandoff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose files from Google Drive | Aidoraa',
  robots: { index: false, follow: false },
};

/** Opened by the Aidoraa app in a browser tab, with a one-time ticket. */
export default async function DrivePickPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ticket } = await searchParams;
  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <DrivePickHandoff ticket={typeof ticket === 'string' ? ticket : ''} />
    </div>
  );
}
