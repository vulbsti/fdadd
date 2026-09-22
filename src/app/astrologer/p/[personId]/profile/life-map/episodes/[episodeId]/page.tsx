import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';
import ChapterDetailView from '@/components/astrologer-v2/ChapterDetailView';

export default async function EpisodePage({ params }: { params: Promise<{ personId: string; episodeId: string }> }) {
  const { personId, episodeId } = await params;
  const projection = await readObjectProjection(await createClient(), personId, episodeId);
  if (!projection || !['episode', 'meaning_change', 'goal', 'current_state'].includes(projection.object.kind)) notFound();
  return <ChapterDetailView projection={projection} />;
}
