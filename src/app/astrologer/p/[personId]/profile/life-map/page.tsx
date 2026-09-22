import { createClient } from '@/lib/supabase/server';
import { readPersonProjection } from '@/lib/astro/person-read-model';
import LifeMapView from '@/components/astrologer-v2/LifeMapView';

export default async function LifeMapPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const projection = await readPersonProjection(await createClient(), personId, 'life-map');
  return <LifeMapView projection={projection} />;
}
