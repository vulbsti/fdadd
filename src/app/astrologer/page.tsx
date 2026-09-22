import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import FirstPerson from '@/components/astrologer-v2/FirstPerson';

export const dynamic = 'force-dynamic';

export default async function AstrologerPage() {
  if (!isSupabaseConfigured()) redirect('/');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/');
  const { data: profiles } = await supabase
    .from('astro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('person_status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (profiles?.[0]) redirect(`/astrologer/p/${profiles[0].id}/profile/life-map`);
  return <FirstPerson />;
}
