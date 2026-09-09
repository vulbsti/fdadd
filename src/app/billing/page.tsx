import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RazorpayCheckoutButton } from '@/components/payments/RazorpayCheckoutButton';
import { getAccessPlan } from '@/lib/payments/catalog';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Payments setup pending</CardTitle>
            <CardDescription>
              Authentication and payment credentials have not been configured yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const plan = getAccessPlan();
  if (!plan) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Pricing setup pending</CardTitle>
            <CardDescription>
              The payment flow is installed, but no server-side price has been configured.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/profile">Back to profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency,
  }).format(plan.amount / 100);

  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <p className="text-3xl font-semibold">{displayAmount}</p>
          <RazorpayCheckoutButton
            planId={plan.id}
            email={user.email}
            name={user.user_metadata.full_name || user.user_metadata.name}
          />
          <p className="text-xs text-muted-foreground">
            Access is granted only after Razorpay confirms that the payment was captured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
