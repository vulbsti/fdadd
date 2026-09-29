import { NextResponse } from 'next/server';
import { googleAccessToken, googleConfig, googlePickerConfig } from '@/lib/connectors/google';
import { importErrorResponse, json, requireOwnedPerson } from '@/lib/imports/http';

export const runtime = 'nodejs';

/**
 * What the browser needs to open the Google Picker. The access token is the
 * person's own short-lived `drive.file` token; the Picker requires it client side.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const owned = await requireOwnedPerson((await params).personId);
  if (owned instanceof NextResponse) return owned;
  const picker = googlePickerConfig();
  const config = googleConfig();
  if (!picker || !config) return json({ code: 'unconfigured', message: 'Google Drive is not set up on this server yet.' }, 503);
  try {
    const accessToken = await googleAccessToken(owned.admin, owned.scope.userId);
    return json({ accessToken, apiKey: picker.apiKey, appId: picker.appId });
  } catch (error) {
    return importErrorResponse(error);
  }
}
