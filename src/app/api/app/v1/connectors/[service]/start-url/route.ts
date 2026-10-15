import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appOAuthState, issueHandoff } from '@/lib/app/handoff';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { googleAuthorizeUrl, googleConfig, googleRedirectUri } from '@/lib/connectors/google';
import { notionAuthorizeUrl, notionConfig, notionRedirectUri } from '@/lib/connectors/notion';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const bodySchema = z.object({ personId: z.string().uuid() }).strict();

/**
 * The provider's consent page for a connection started in the app. The app
 * opens `url` in a browser tab; the callback saves the connection as on the
 * web and returns to aidoraa://connectors/<service>?result=connected|cancelled|failed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ service: string }> }) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const { service } = await params;
  if (service !== 'notion' && service !== 'google') return appError(404, 'not_found', 'Unknown connection.');
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'Choose a person first.');
  const config = service === 'notion' ? notionConfig() : googleConfig();
  if (!config) return appError(503, 'unconfigured', `${service === 'notion' ? 'Notion' : 'Google Drive'} is not available yet.`);
  const { data: person, error } = await context.client.from('astro_profiles').select('id')
    .eq('id', parsed.data.personId).eq('user_id', context.userId).eq('person_status', 'active').maybeSingle();
  if (error) return appFailure('connector start', error);
  if (!person) return appError(404, 'not_found', 'Person was not found.');
  try {
    const token = await issueHandoff(createAdminClient(), { kind: `oauth_${service}`, userId: context.userId, personId: parsed.data.personId });
    const state = appOAuthState(token);
    const url = service === 'notion'
      ? notionAuthorizeUrl(config.clientId, notionRedirectUri(request.url), state)
      : googleAuthorizeUrl(config.clientId, googleRedirectUri(request.url), state);
    return appJson({ url });
  } catch (failure) {
    return appFailure('connector start', failure);
  }
}
