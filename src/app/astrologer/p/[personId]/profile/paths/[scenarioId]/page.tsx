import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';
import ChapterDetailView from '@/components/astrologer-v2/ChapterDetailView';

export default async function ScenarioPage({ params }: { params: Promise<{ personId: string; scenarioId: string }> }) { const { personId, scenarioId } = await params; const projection = await readObjectProjection(await createClient(), personId, scenarioId); if (!projection || !['scenario', 'goal'].includes(projection.object.kind)) notFound(); return <ChapterDetailView projection={projection} />; }
