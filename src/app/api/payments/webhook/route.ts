import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/signatures';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function entityFrom(payload: unknown, kind: 'payment' | 'order'): UnknownRecord | null {
  const root = asRecord(payload);
  const wrapped = asRecord(root?.[kind]);
  return asRecord(wrapped?.entity);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  if (!verifyWebhookSignature({ rawBody, signature, webhookSecret })) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  let event: UnknownRecord;
  try {
    event = JSON.parse(rawBody) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const eventName = typeof event.event === 'string' ? event.event : '';
  const admin = createAdminClient();

  if (eventName === 'payment.captured' || eventName === 'payment.failed') {
    const payment = entityFrom(event.payload, 'payment');
    const orderId = typeof payment?.order_id === 'string' ? payment.order_id : null;
    const paymentId = typeof payment?.id === 'string' ? payment.id : null;

    if (orderId && paymentId) {
      let query = admin
        .from('payment_orders')
        .update({
          razorpay_payment_id: paymentId,
          status: eventName === 'payment.captured' ? 'paid' : 'failed',
        })
        .eq('razorpay_order_id', orderId);

      if (eventName === 'payment.failed') query = query.neq('status', 'paid');
      const { error } = await query;
      if (error) {
        console.error('Could not apply Razorpay payment webhook:', error.code);
        return NextResponse.json({ error: 'Webhook could not be applied.' }, { status: 500 });
      }
    }
  }

  if (eventName === 'order.paid') {
    const order = entityFrom(event.payload, 'order');
    const orderId = typeof order?.id === 'string' ? order.id : null;
    if (orderId) {
      const { error } = await admin
        .from('payment_orders')
        .update({ status: 'paid' })
        .eq('razorpay_order_id', orderId);
      if (error) {
        console.error('Could not apply Razorpay order webhook:', error.code);
        return NextResponse.json({ error: 'Webhook could not be applied.' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
