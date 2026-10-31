import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/lib/legal';
import { betaSignupConfig, MANUAL_GROUP_URL, PLAY_OPT_IN_URL, PLAY_STORE_URL } from '@/lib/beta/testers';
import { AutoForward } from './auto-forward';

export const metadata: Metadata = {
  title: 'Test the Aidoraa app | Aidoraa',
  description: 'Join the Aidoraa Android test in one tap, then install from Google Play.',
};

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Tap the button again whenever you are ready.',
  signin: 'We could not confirm your Google account. Please try again.',
  group: 'We could not add you just now. Please try again in a minute, or use the manual steps below.',
  not_ready: 'One-tap signup is not switched on yet. Please use the steps below.',
};

const MANUAL_STEPS = [
  {
    title: 'Join the testers group',
    body: 'Open the link with the Google account on your Android phone and tap "Join group" (it may be on the side of the page).',
    href: MANUAL_GROUP_URL,
    action: 'Join the group',
  },
  {
    title: 'Become a tester and install',
    body: 'Open this link with the same account, tap "Become a tester", then "Download it on Google Play".',
    href: PLAY_OPT_IN_URL,
    action: 'Become a tester',
  },
];

function Footer() {
  return (
    <div className="grid gap-2 text-sm text-muted-foreground">
      <p>
        Please keep the app for at least 14 days and open it now and then. Google only lets the app launch publicly after
        testers have stayed in for two weeks.
      </p>
      <p>
        Something off? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}

function ManualSteps() {
  return (
    <ol className="grid gap-5">
      {MANUAL_STEPS.map((step, index) => (
        <li key={step.title} className="grid gap-2">
          <p className="text-sm font-medium">
            {index + 1}. {step.title}
          </p>
          <p className="text-sm text-muted-foreground">{step.body}</p>
          <Button asChild variant={index === 0 ? 'default' : 'outline'} className="justify-self-start">
            <a href={step.href} target="_blank" rel="noopener noreferrer">
              {step.action}
            </a>
          </Button>
        </li>
      ))}
    </ol>
  );
}

export default async function BetaPage({ searchParams }: { searchParams: Promise<{ joined?: string; error?: string }> }) {
  const { joined, error } = await searchParams;
  const oneTap = betaSignupConfig() !== null;

  if (joined) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16">
        <AutoForward href={PLAY_OPT_IN_URL} />
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re on the list</CardTitle>
            <CardDescription>
              We added {joined}. Taking you to Google Play now. Tap &quot;Become a tester&quot; there, then &quot;Download
              it on Google Play&quot; to install.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={PLAY_OPT_IN_URL}>Continue to Google Play</a>
              </Button>
              <Button asChild variant="outline">
                <a href={PLAY_STORE_URL}>Install the app</a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              If Google says you are not eligible or the app is not available, give it a minute and tap Continue again.
              Your phone must use the same Google account in the Play Store.
            </p>
            <Footer />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Test the Aidoraa app</CardTitle>
          <CardDescription>
            Thanks for helping. Aidoraa for Android is in a closed test on Google Play. You need an Android phone and the
            Google account you use in its Play Store.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {error && ERRORS[error] ? <p className="text-sm text-destructive">{ERRORS[error]}</p> : null}
          {oneTap ? (
            <div className="grid gap-3">
              <Button asChild size="lg" className="justify-self-start">
                <a href="/beta/start">Become a tester</a>
              </Button>
              <p className="text-sm text-muted-foreground">
                Pick the Google account on your phone. We add it to the test and send you to Google Play, where you tap
                &quot;Become a tester&quot; once and install.
              </p>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Rather do it by hand?</summary>
                <div className="pt-4">
                  <ManualSteps />
                </div>
              </details>
            </div>
          ) : (
            <ManualSteps />
          )}
          <Footer />
        </CardContent>
      </Card>
    </div>
  );
}
