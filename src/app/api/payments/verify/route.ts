import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRazorpayConfig } from '@/lib/payments/razorpay';
import { verifyPaymentSignature } from '@/lib/payments/signatures';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const requestSchema = z.object({
  internalOrderId: z.string().uuid(),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from('payment_orders')
    .select('id, razorpay_order_id, status')
    .eq('id', parsed.data.internalOrderId)
    .eq('user_id', user.id)
    .single();

  if (orderError || !order?.razorpay_order_id) {
    return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  }

  const { keySecret } = getRazorpayConfig();
  const valid = verifyPaymentSignature({
    orderId: order.razorpay_order_id,
    paymentId: parsed.data.razorpayPaymentId,
    signature: parsed.data.razorpaySignature,
    keySecret,
  });

  if (!valid) {
    return NextResponse.json({ error: 'Payment signature is invalid.' }, { status: 400 });
  }

  if (order.status !== 'paid') {
    const { error: updateError } = await admin
      .from('payment_orders')
      .update({
        razorpay_payment_id: parsed.data.razorpayPaymentId,
        razorpay_signature: parsed.data.razorpaySignature,
        status: 'verified',
      })
      .eq('id', order.id)
      .neq('status', 'paid');

    if (updateError) {
      console.error('Could not record payment verification:', updateError.code);
      return NextResponse.json({ error: 'Payment verification could not be recorded.' }, { status: 500 });
    }
  }

  return NextResponse.json({
    verified: true,
    status: order.status === 'paid' ? 'paid' : 'processing',
  });
}
