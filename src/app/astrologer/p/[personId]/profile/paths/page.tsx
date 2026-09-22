import { createClient } from '@/lib/supabase/server';
import { readPersonProjection } from '@/lib/astro/person-read-model';
import ProfileCollectionView from '@/components/astrologer-v2/ProfileCollectionView';

export default async function PathsPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <ProfileCollectionView projection={await readPersonProjection(await createClient(), personId, 'paths')} />;
}
