import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AIDORAA_ACCESS_PLAN_ID, requirePaymentPlan } from '@/lib/payments/catalog';
import { getRazorpayClient, getRazorpayConfig } from '@/lib/payments/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const requestSchema = z.object({
  planId: z.literal(AIDORAA_ACCESS_PLAN_ID),
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
    return NextResponse.json({ error: 'Sign in before starting checkout.' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payment request.' }, { status: 400 });
  }

  try {
    const plan = requirePaymentPlan(parsed.data.planId);
    const internalOrderId = randomUUID();
    const receipt = `aidora_${internalOrderId.replaceAll('-', '')}`;
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt,
      notes: {
        internal_order_id: internalOrderId,
        user_id: user.id,
        plan_id: plan.id,
      },
    });

    const admin = createAdminClient();
    const { error: insertError } = await admin.from('payment_orders').insert({
      id: internalOrderId,
      user_id: user.id,
      plan_id: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      razorpay_order_id: order.id,
      status: 'created',
    });

    if (insertError) {
      console.error('Could not persist Razorpay order:', insertError.code);
      return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 });
    }

    const { keyId } = getRazorpayConfig();
    return NextResponse.json({
      internalOrderId,
      razorpayOrderId: order.id,
      keyId,
      amount: plan.amount,
      currency: plan.currency,
      name: plan.name,
      description: plan.description,
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Checkout is temporarily unavailable.' }, { status: 503 });
  }
}
