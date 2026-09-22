import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';
import ChapterDetailView from '@/components/astrologer-v2/ChapterDetailView';

export default async function ChapterPage({ params }: { params: Promise<{ personId: string; chapterId: string }> }) {
  const { personId, chapterId } = await params;
  const projection = await readObjectProjection(await createClient(), personId, chapterId);
  if (!projection || projection.object.kind !== 'chapter') notFound();
  return <ChapterDetailView projection={projection} />;
}
