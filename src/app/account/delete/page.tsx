import type { Metadata } from 'next';
import Link from 'next/link';
import { DeleteAccountForm } from '@/components/account/DeleteAccountForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Delete your account | Aidoraa',
  description: 'How to delete your Aidoraa account and everything in it.',
};

const WHAT_GOES = [
  'Your account and sign-in',
  'Everyone you added, and everything Aidoraa learned about them',
  'All your conversations',
  'Files and chats you brought in from other apps, and any connected Google Drive or Notion',
  'Your plan details and app settings',
];

function Membership() {
  return (
    <p className="text-sm text-muted-foreground">
      If you pay for a plan through Google Play, deleting your account does not by itself cancel it there. We ask Google
      Play to stop the renewal, but please also check Google Play, under Payments &amp; subscriptions, and cancel it if it
      is still listed.
    </p>
  );
}

export default async function DeleteAccountPage() {
  const user = isSupabaseConfigured() ? (await (await createClient()).auth.getUser()).data.user : null;

  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Delete your account</CardTitle>
          <CardDescription>
            This removes your Aidoraa account and everything in it, right away and for good. It cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <p className="text-sm font-medium">What will be deleted</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {WHAT_GOES.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <Membership />
          {user ? (
            <div className="grid gap-3">
              <p className="text-sm">
                You are signed in as <span className="font-medium">{user.email ?? 'your Aidoraa account'}</span>.
              </p>
              <DeleteAccountForm />
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm">
                To delete your account, sign in first with the same account you use in the app. Continue with Google
                brings you straight back here.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/auth/google/start?next=/account/delete">Continue with Google</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/?auth=login">Sign in with email</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If you sign in with email, come back to aidoraa.com/account/delete afterwards.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
