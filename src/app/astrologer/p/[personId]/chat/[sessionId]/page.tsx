import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import GuidedChatView from '@/components/astrologer-v2/GuidedChatView';

export default async function ChatPage({ params, searchParams }: { params: Promise<{ personId: string; sessionId: string }>; searchParams: Promise<{ messageId?: string }> }) {
  const { personId, sessionId } = await params;
  const { messageId } = await searchParams;
  const client = await createClient();
  const [{ data: session }, { data: preference }, { data: exploration }] = await Promise.all([
    client.from('astro_sessions').select('id,profile_id,title').eq('id', sessionId).eq('profile_id', personId).maybeSingle(),
    client.from('person_preferences').select('astrology_enabled').eq('profile_id', personId).maybeSingle(),
    client.from('person_exploration_contexts').select('object_id,object_version_id,person_revision,prompt_key').eq('session_id', sessionId).eq('profile_id', personId).eq('status', 'active').maybeSingle(),
  ]);
  if (!session) notFound();
  let context: { objectId: string; title: string; kind: string; personRevision: number; payload: Record<string, unknown> } | null = null;
  if (exploration) {
    const { data: version } = await client.from('person_object_versions')
      .select('object_id,typed_payload')
      .eq('id', exploration.object_version_id)
      .eq('object_id', exploration.object_id)
      .eq('profile_id', personId)
      .maybeSingle();
    const payload = version?.typed_payload as Record<string, unknown> | undefined;
    if (version && payload && typeof payload.title === 'string') {
      context = {
        objectId: version.object_id,
        title: payload.title,
        kind: typeof payload.kind === 'string' ? payload.kind : 'account',
        personRevision: Number(exploration.person_revision),
        payload,
      };
    }
  }
  return <GuidedChatView personId={personId} sessionId={sessionId} context={context} personalOnly={!preference?.astrology_enabled} anchorMessageId={messageId} />;
}
