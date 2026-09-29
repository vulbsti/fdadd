import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ImportsView from '@/components/astrologer-v2/imports/ImportsView';

export default async function ImportsPage({ params, searchParams }: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ notion?: string }>;
}) {
  const [{ personId }, { notion }] = await Promise.all([params, searchParams]);
  const client = await createClient();
  const { data: profile } = await client.from('astro_profiles').select('name').eq('id', personId).maybeSingle();
  if (!profile) notFound();
  return <ImportsView personId={personId} personName={profile.name} notionOutcome={notion ?? null} />;
}
