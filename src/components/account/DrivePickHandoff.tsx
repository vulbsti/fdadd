'use client';

import { useEffect, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { pickDriveFiles } from '@/components/astrologer-v2/imports/drive-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { appImportsLink } from '@/lib/app/handoff-links';

interface PickerSession { session: string; personId: string; accessToken: string; apiKey: string; appId: string }

async function call<T>(body: unknown): Promise<T> {
  const response = await fetch('/api/connectors/google/pick', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'Something went wrong. Go back to the app and try again.');
  return payload;
}

/**
 * The Drive picker for the app. The ticket in the link is exchanged once for
 * a picker session; the picked files are fetched into a pending import, then
 * the tab returns to the app, which shows the import for review.
 */
export function DrivePickHandoff({ ticket }: { ticket: string }) {
  const [session, setSession] = useState<PickerSession | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    call<PickerSession>({ action: 'open', ticket }).then(setSession, (failure: Error) => setError(failure.message));
  }, [ticket]);

  const backToApp = (link: string) => { window.location.href = link; };

  const choose = async () => {
    if (!session) return;
    setError(null);
    try {
      const fileIds = await pickDriveFiles(session);
      if (!fileIds.length) {
        await call({ action: 'close', session: session.session }).catch(() => null);
        backToApp(appImportsLink({ result: 'cancelled', personId: session.personId }));
        return;
      }
      let importId: string | null = null;
      let added = 0;
      for (let index = 0; index < fileIds.length; index += 10) {
        setProgress(`Fetching files ${index + 1} to ${Math.min(fileIds.length, index + 10)} of ${fileIds.length}`);
        const result: { importId: string; added: number } = await call({
          action: 'files', session: session.session, importId, fileIds: fileIds.slice(index, index + 10),
        });
        importId = result.importId;
        added += result.added;
      }
      await call({ action: 'close', session: session.session }).catch(() => null);
      backToApp(appImportsLink({ result: added ? 'imported' : 'failed', count: added, personId: session.personId, importId }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your files could not be fetched.');
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose files from Google Drive</CardTitle>
        <CardDescription>
          Pick the documents you want Aidoraa to read. Only the files you pick are shared, nothing else in your Drive.
          You will go back to the app to check them before they are added.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {progress ? (
          <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{progress}</p>
        ) : session ? (
          <Button onClick={() => void choose()}><FileUp className="mr-2 h-4 w-4" />Choose files</Button>
        ) : !error ? (
          <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Getting ready</p>
        ) : null}
        <Button variant="outline" onClick={() => backToApp(appImportsLink(error && !session
          ? { result: 'failed' } : { result: 'cancelled', personId: session?.personId }))}>
          Back to the app
        </Button>
      </CardContent>
    </Card>
  );
}
