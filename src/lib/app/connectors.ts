import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { appConnectorLink, consumeHandoff, ownsActivePerson, type ConnectorResult, type ConnectorService } from './handoff';

/**
 * The OAuth callback of a connection started from the app. The browser tab
 * the app opened has no website cookie, so the user and person come from the
 * one-time state instead. The connection is saved exactly as on the web,
 * then the tab hands back to the app with aidoraa://connectors/<service>.
 */
export async function finishAppConnection(request: Request, service: ConnectorService, token: string,
  connect: (admin: SupabaseClient, userId: string, code: string) => Promise<unknown>): Promise<NextResponse> {
  const url = new URL(request.url);
  const back = (result: ConnectorResult) => NextResponse.redirect(appConnectorLink(service, result));
  try {
    const admin = createAdminClient();
    const handoff = await consumeHandoff(admin, `oauth_${service}`, token);
    if (!handoff) return back('failed');
    if (url.searchParams.get('error')) return back('cancelled');
    const code = url.searchParams.get('code');
    if (!code || !(await ownsActivePerson(admin, handoff.userId, handoff.personId))) return back('failed');
    await connect(admin, handoff.userId, code);
    return back('connected');
  } catch (error) {
    console.error(`[${service}] app connection failed`, { message: error instanceof Error ? error.message : 'unknown' });
    return back('failed');
  }
}
