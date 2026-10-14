import { NextResponse } from 'next/server';
import { appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { readHomeLayout } from '@/lib/app/home-layout';
import { minSupportedVersion } from '@/lib/app/version';
import { countQuestionsThisMonth, isMissingSchema, planSummary, readSubscription } from '@/lib/payments/subscriptions';

export const runtime = 'nodejs';

/** Everything the app needs on launch, in one round trip. */
export async function GET(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const { client, user, userId } = context;
  try {
    const [profile, people, preferences, subscription, questionsUsed] = await Promise.all([
      client.from('profiles').select('display_name,avatar_url').eq('id', userId).maybeSingle(),
      client.from('astro_profiles').select('id,name,astro_status').eq('user_id', userId).eq('person_status', 'active')
        .order('updated_at', { ascending: false }),
      client.from('app_preferences').select('home_layout').eq('user_id', userId).maybeSingle(),
      readSubscription(client, userId),
      countQuestionsThisMonth(client, userId),
    ]);
    if (profile.error) throw profile.error;
    if (people.error) throw people.error;
    if (preferences.error && !isMissingSchema(preferences.error)) throw preferences.error;
    const metadata = user.user_metadata ?? {};
    return appJson({
      minSupportedVersion: minSupportedVersion(),
      user: {
        id: userId,
        email: user.email ?? null,
        displayName: profile.data?.display_name ?? metadata.full_name ?? metadata.name ?? null,
        avatarUrl: profile.data?.avatar_url ?? metadata.avatar_url ?? null,
      },
      plan: planSummary(subscription, questionsUsed),
      profiles: (people.data ?? []).map((person) => ({ id: person.id, name: person.name, astroStatus: person.astro_status })),
      homeLayout: readHomeLayout(preferences.data?.home_layout ?? null),
      flags: {},
    });
  } catch (error) {
    return appFailure('bootstrap', error);
  }
}
