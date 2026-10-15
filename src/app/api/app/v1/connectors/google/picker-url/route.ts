import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueHandoff } from '@/lib/app/handoff';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { googleConfig, googleConnection, googlePickerConfig } from '@/lib/connectors/google';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const bodySchema = z.object({ personId: z.string().uuid() }).strict();

/**
 * A one-time link to the web page that shows Google's Drive picker for this
 * user and person. The app opens it in a browser tab; the page fetches the
 * picked files into a pending import and returns to aidoraa://imports.
 * The link carries a ticket only, never an access token.
 */
export async function POST(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'Choose a person first.');
  if (!googleConfig() || !googlePickerConfig()) return appError(503, 'unconfigured', 'Google Drive is not available yet.');
  const { data: person, error } = await context.client.from('astro_profiles').select('id')
    .eq('id', parsed.data.personId).eq('user_id', context.userId).eq('person_status', 'active').maybeSingle();
  if (error) return appFailure('picker link', error);
  if (!person) return appError(404, 'not_found', 'Person was not found.');
  try {
    const admin = createAdminClient();
    if (!(await googleConnection(admin, context.userId))) return appError(409, 'google_not_connected', 'Connect Google Drive first.');
    const ticket = await issueHandoff(admin, { kind: 'google_picker', userId: context.userId, personId: parsed.data.personId });
    const url = new URL('/connectors/google/pick', request.url);
    url.searchParams.set('ticket', ticket);
    return appJson({ url: url.toString() });
  } catch (failure) {
    return appFailure('picker link', failure);
  }
}
