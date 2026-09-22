import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import WorkspaceShell from '@/components/astrologer-v2/WorkspaceShell';
import type { WorkspaceConversation, WorkspacePerson } from '@/components/astrologer-v2/types';

export const dynamic = 'force-dynamic';

export default async function PersonLayout({ children, params }: { children: React.ReactNode; params: Promise<unknown> }) {
  const { personId } = await params as { personId: string };
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/');
  const [{ data: profile }, { data: profiles }, { data: preferences }, { data: sessions }] = await Promise.all([
    client.from('astro_profiles').select('id,name,astro_status').eq('id', personId).eq('user_id', user.id).eq('person_status', 'active').maybeSingle(),
    client.from('astro_profiles').select('id,name,astro_status').eq('user_id', user.id).eq('person_status', 'active').order('updated_at', { ascending: false }),
    client.from('person_preferences').select('profile_id,astrology_enabled,mode_epoch').eq('user_id', user.id),
    client.from('astro_sessions').select('id,title,updated_at').eq('profile_id', personId).eq('user_id', user.id).order('updated_at', { ascending: false }).limit(30),
  ]);
  if (!profile) notFound();
  const preferenceMap = new Map((preferences ?? []).map((item) => [item.profile_id, item]));
  const toPerson = (item: { id: string; name: string; astro_status: string }): WorkspacePerson => {
    const preference = preferenceMap.get(item.id);
    return { id: item.id, name: item.name, mode: preference?.astrology_enabled ? 'astrology' : 'personal', modeEpoch: Number(preference?.mode_epoch ?? 0), hasBirthProfile: item.astro_status === 'ready' };
  };
  const people = (profiles ?? []).map(toPerson);
  const person = toPerson(profile);
  const conversations: WorkspaceConversation[] = (sessions ?? []).map((item) => ({ id: item.id, title: item.title || 'New conversation', updatedAt: item.updated_at }));
  return <WorkspaceShell person={person} people={people} conversations={conversations}>{children}</WorkspaceShell>;
}
