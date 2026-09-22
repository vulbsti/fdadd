import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readObjectProjection } from '@/lib/astro/person-read-model';
import PatternDetailView from '@/components/astrologer-v2/PatternDetailView';

export default async function PatternPage({ params }: { params: Promise<{ personId: string; patternId: string }> }) {
  const { personId, patternId } = await params;
  const projection = await readObjectProjection(await createClient(), personId, patternId);
  if (!projection || projection.object.kind !== 'pattern') notFound();
  return <PatternDetailView projection={projection} />;
}
