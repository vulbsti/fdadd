import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsForm from '@/components/astrologer-v2/SettingsForm';

export default async function SettingsPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const client = await createClient();
  const [{ data: profile }, { data: preference }] = await Promise.all([
    client.from('astro_profiles').select('name,astro_status').eq('id', personId).maybeSingle(),
    client.from('person_preferences').select('astrology_enabled,mode_epoch').eq('profile_id', personId).maybeSingle(),
  ]);
  if (!profile || !preference) notFound();
  return <SettingsForm personId={personId} name={profile.name} astrologyEnabled={preference.astrology_enabled} modeEpoch={Number(preference.mode_epoch)} hasBirth={profile.astro_status === 'ready'} />;
}
