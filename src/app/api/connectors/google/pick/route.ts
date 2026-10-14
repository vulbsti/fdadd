import { z } from 'zod';
import { consumeHandoff, endHandoff, issueHandoff, ownsActivePerson, readHandoff } from '@/lib/app/handoff';
import { googleAccessToken, googlePickerConfig } from '@/lib/connectors/google';
import { importErrorResponse, json } from '@/lib/imports/http';
import { addDriveFiles } from '@/lib/imports/drive';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PICKER_SESSION_MS = 20 * 60 * 1000;

const schema = z.discriminatedUnion('action', [
  // Trade the one-time ticket from the link for a picker session (in the body, not the URL).
  z.object({ action: z.literal('open'), ticket: z.string().max(100) }).strict(),
  z.object({
    action: z.literal('files'), session: z.string().max(100),
    importId: z.string().uuid().nullable(), fileIds: z.array(z.string().min(1).max(200)).min(1).max(25),
  }).strict(),
  z.object({ action: z.literal('close'), session: z.string().max(100) }).strict(),
]);

const expired = () => json({ code: 'expired', message: 'This link has expired. Go back to the app and try again.' }, 410);

/**
 * Backs /connectors/google/pick, the Drive picker page the app opens. It has
 * no website cookie: the app's one-time ticket names the user and person.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'invalid_request', message: 'Invalid request.' }, 400);
  const admin = createAdminClient();
  try {
    if (parsed.data.action === 'open') {
      const ticket = await consumeHandoff(admin, 'google_picker', parsed.data.ticket);
      if (!ticket || !(await ownsActivePerson(admin, ticket.userId, ticket.personId))) return expired();
      const picker = googlePickerConfig();
      if (!picker) return json({ code: 'unconfigured', message: 'Google Drive is not set up on this server yet.' }, 503);
      const accessToken = await googleAccessToken(admin, ticket.userId);
      const session = await issueHandoff(admin, { kind: 'google_picker_session', userId: ticket.userId, personId: ticket.personId, ttlMs: PICKER_SESSION_MS });
      return json({ session, personId: ticket.personId, accessToken, apiKey: picker.apiKey, appId: picker.appId });
    }
    if (parsed.data.action === 'close') {
      await endHandoff(admin, 'google_picker_session', parsed.data.session);
      return json({ closed: true });
    }
    const session = await readHandoff(admin, 'google_picker_session', parsed.data.session);
    if (!session || !(await ownsActivePerson(admin, session.userId, session.personId))) return expired();
    const scope = { userId: session.userId, personId: session.personId };
    return json(await addDriveFiles(admin, scope, parsed.data.importId, parsed.data.fileIds));
  } catch (error) {
    return importErrorResponse(error);
  }
}
