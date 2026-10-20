import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const messages: Record<string, string> = {
  not_configured: 'Authentication has not been configured for this environment.',
  oauth_callback_failed: 'Google sign-in could not be completed. Please try again.',
  callback_failed:
    'We could not finish signing you in on this browser. If you were confirming your email, it is confirmed: sign in to continue.',
  recovery_link_failed:
    'This reset link could not be used in this browser. Open it in the browser where you asked for it, or request a new one.',
  email_confirmation_failed: 'This confirmation link is invalid or has expired.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="container mx-auto max-w-xl px-4 py-20">
      <Alert variant="destructive">
        <AlertTitle>Authentication problem</AlertTitle>
        <AlertDescription>
          {messages[reason ?? ''] ?? 'Authentication could not be completed.'}
        </AlertDescription>
      </Alert>
      <div className="mt-6 flex flex-wrap gap-3">
        {reason === 'callback_failed' || reason === 'oauth_callback_failed' ? (
          <Button asChild>
            <Link href="/astrologer">Sign in</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </div>
  );
}
