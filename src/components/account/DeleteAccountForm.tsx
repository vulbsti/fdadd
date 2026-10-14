'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type DeleteResponse = { deleted?: boolean; googlePlayRenewalStopped?: boolean | null; message?: string };

export function DeleteAccountForm() {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteResponse | null>(null);

  const deleteAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/app/v1/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmation }),
      });
      const body = (await response.json().catch(() => ({}))) as DeleteResponse;
      if (!response.ok || !body.deleted) throw new Error(body.message || 'Your account could not be deleted. Please try again.');
      // The server has already ended every session; this clears this browser too.
      await createClient().auth.signOut({ scope: 'local' }).catch(() => null);
      setResult(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your account could not be deleted. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertDescription>
            Your account and everything in it have been deleted. You have been signed out on all your devices.
          </AlertDescription>
        </Alert>
        {result.googlePlayRenewalStopped === false && (
          <Alert variant="destructive">
            <AlertDescription>
              We could not stop your Google Play membership from renewing. Please cancel it in Google Play under
              Payments &amp; subscriptions so you are not charged again.
            </AlertDescription>
          </Alert>
        )}
        <Button variant="outline" asChild>
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void deleteAccount();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
        <Input
          id="confirm-delete"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="DELETE"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="destructive" disabled={loading || confirmation !== 'DELETE'}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
        Delete my account for good
      </Button>
    </form>
  );
}
