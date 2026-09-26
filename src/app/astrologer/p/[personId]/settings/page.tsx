import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsForm from '@/components/astrologer-v2/SettingsForm';

export default async function SettingsPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const client = await createClient();
  const [{ data: profile }, { data: preference }] = await Promise.all([
    client.from('astro_profiles').select('name,astro_status,initialization_error,birth_date,birth_time,lat,lng,tz,place_name,time_source,time_confidence').eq('id', personId).maybeSingle(),
    client.from('person_preferences').select('astrology_enabled,mode_epoch').eq('profile_id', personId).maybeSingle(),
  ]);
  if (!profile || !preference) notFound();
  const hasBirth = profile.birth_date && profile.birth_time && profile.lat !== null && profile.lng !== null && profile.tz;
  return <SettingsForm
    personId={personId}
    name={profile.name}
    astrologyEnabled={preference.astrology_enabled}
    modeEpoch={Number(preference.mode_epoch)}
    astroStatus={profile.astro_status}
    initializationError={profile.initialization_error}
    birth={hasBirth ? {
      date: profile.birth_date,
      time: profile.birth_time,
      latitude: profile.lat,
      longitude: profile.lng,
      timezone: profile.tz,
      place_name: profile.place_name,
      time_source: profile.time_source,
      time_confidence: profile.time_confidence,
    } : null}
  />;
}
