import Link from 'next/link';
import { Upload } from 'lucide-react';

export default async function ImportsPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <div className="mx-auto max-w-3xl px-5 py-14 md:px-10"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#e7eadf]"><Upload /></span><h1 className="mt-7 font-serif text-5xl">Import conversations</h1><p className="mt-4 max-w-2xl leading-7 text-[#52627a]">Import is not enabled in this P2 authority release. No file will be accepted without preview, speaker mapping, explicit confirmation, and durable removal semantics.</p><Link href={`/astrologer/p/${personId}/profile/life-map`} className="mt-7 inline-block text-sm underline underline-offset-4">Return to life map</Link></div>;
}
