'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type CheckoutResponse = {
  internalOrderId: string;
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
};

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: 'payment.failed', handler: () => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.body.appendChild(script);
  });

  return checkoutScriptPromise;
}

export function RazorpayCheckoutButton({
  planId,
  email,
  name,
}: {
  planId: string;
  email?: string;
  name?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const startCheckout = async () => {
    setLoading(true);
    setMessage(null);
    setFailed(false);

    try {
      const [orderResponse] = await Promise.all([
        fetch('/api/payments/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        }),
        loadCheckoutScript(),
      ]);

      const orderBody = (await orderResponse.json()) as CheckoutResponse & { error?: string };
      if (!orderResponse.ok) throw new Error(orderBody.error || 'Checkout could not be started.');
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');

      const checkout = new window.Razorpay({
        key: orderBody.keyId,
        amount: orderBody.amount,
        currency: orderBody.currency,
        name: orderBody.name,
        description: orderBody.description,
        order_id: orderBody.razorpayOrderId,
        prefill: { email, name },
        theme: { color: '#7c3aed' },
        handler: async (response: RazorpaySuccess) => {
          const verifyResponse = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              internalOrderId: orderBody.internalOrderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });
          const verifyBody = (await verifyResponse.json()) as { error?: string; status?: string };
          if (!verifyResponse.ok) {
            setFailed(true);
            setMessage(verifyBody.error || 'Payment verification failed.');
            return;
          }

          setMessage(
            verifyBody.status === 'paid'
              ? 'Payment received.'
              : 'Payment verified. Final confirmation is processing.'
          );
        },
      });

      checkout.on('payment.failed', () => {
        setFailed(true);
        setMessage('Payment was not completed. You can try again safely.');
      });
      checkout.open();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Checkout could not be started.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <Button onClick={() => void startCheckout()} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="mr-2 h-4 w-4" />
        )}
        Pay securely with Razorpay
      </Button>
      {message && (
        <Alert variant={failed ? 'destructive' : 'default'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
