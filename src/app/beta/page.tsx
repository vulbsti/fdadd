import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Test the Aidoraa app | Aidoraa',
  description: 'Join the Aidoraa Android test: two taps to join, then install from Google Play.',
};

/** The Google Group that is the closed test's tester list: anyone can join. */
const GROUP_URL = 'https://groups.google.com/g/aidoraa-testers';
/** Play's opt-in page for the closed test. Works for members of the group above. */
const OPT_IN_URL = 'https://play.google.com/apps/testing/com.aidoraa.app';

const STEPS = [
  {
    title: 'Join the testers group',
    body: 'Open the link with the Google account you use on your Android phone, then tap "Join group".',
    href: GROUP_URL,
    action: 'Join the group',
  },
  {
    title: 'Become a tester on Google Play',
    body: 'Open this link signed in with the same Google account and tap "Become a tester". It can take a few minutes after joining the group.',
    href: OPT_IN_URL,
    action: 'Become a tester',
  },
  {
    title: 'Install and use Aidoraa',
    body: 'Tap "Download it on Google Play", install, and create your account. Use it a few times over the next two weeks.',
    href: 'https://play.google.com/store/apps/details?id=com.aidoraa.app',
    action: 'Open in Google Play',
  },
];

export default function BetaPage() {
  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Test the Aidoraa app</CardTitle>
          <CardDescription>
            Thanks for helping. Aidoraa for Android is in a closed test on Google Play. It takes three steps and about two
            minutes. You need an Android phone and a Google account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ol className="grid gap-5">
            {STEPS.map((step, index) => (
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
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>
              Please stay in the group for at least 14 days. Google only lets the app launch publicly after testers have
              stayed in for two weeks, so leaving early resets your part.
            </p>
            <p>
              Something off, or a step not working? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See our{' '}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
