import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const messages: Record<string, string> = {
  not_configured: 'Authentication has not been configured for this environment.',
  oauth_callback_failed: 'Google sign-in could not be completed. Please try again.',
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
      <Button asChild className="mt-6">
        <Link href="/">Return home</Link>
      </Button>
    </div>
  );
}
