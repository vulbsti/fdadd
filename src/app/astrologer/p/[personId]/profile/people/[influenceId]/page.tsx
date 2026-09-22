import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';
import ChapterDetailView from '@/components/astrologer-v2/ChapterDetailView';

export default async function InfluencePage({ params }: { params: Promise<{ personId: string; influenceId: string }> }) { const { personId, influenceId } = await params; const projection = await readObjectProjection(await createClient(), personId, influenceId); if (!projection || projection.object.kind !== 'influence') notFound(); return <ChapterDetailView projection={projection} />; }
