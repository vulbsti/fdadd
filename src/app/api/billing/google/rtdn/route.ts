import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { decodeRtdn, GooglePlayError, googlePlayConfig } from '@/lib/payments/google-play';
import { syncGooglePurchase, voidGooglePurchase } from '@/lib/payments/google-play-sync';
import { GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SUBSCRIPTION_ID } from '@/lib/payments/plans';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Google Play Real-time developer notifications, pushed by Cloud Pub/Sub.
 * The push subscription URL carries a shared secret:
 *   https://www.aidoraa.com/api/billing/google/rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>
 * A notification only says that something changed; the purchase is always
 * read again from Google. Anything we do not act on is acknowledged with 200
 * straight away; a failure while updating answers 500 so Pub/Sub retries.
 */

const ok = (body: Record<string, unknown> = {}) => NextResponse.json({ received: true, ...body });

function tokenMatches(given: string | null, expected: string) {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.GOOGLE_PLAY_RTDN_TOKEN?.trim();
  if (!expected) return NextResponse.json({ code: 'unconfigured', message: 'Notifications are not configured.' }, { status: 503 });
  if (!tokenMatches(new URL(request.url).searchParams.get('token'), expected)) {
    return NextResponse.json({ code: 'forbidden', message: 'Invalid notification credential.' }, { status: 401 });
  }
  const notification = decodeRtdn(await request.json().catch(() => null));
  if (!notification || notification.packageName !== GOOGLE_PLAY_PACKAGE_NAME) return ok({ ignored: true });

  try {
    const voided = notification.voidedPurchaseNotification;
    // productType 1 is a subscription: a refund or chargeback ends it now.
    if (voided?.purchaseToken && voided.productType === 1) {
      await voidGooglePurchase(createAdminClient(), voided.purchaseToken);
      return ok({ voided: true });
    }
    const change = notification.subscriptionNotification;
    if (!change?.purchaseToken || change.subscriptionId !== GOOGLE_PLAY_SUBSCRIPTION_ID) return ok({ ignored: true });
    const config = googlePlayConfig();
    if (!config) return NextResponse.json({ code: 'unconfigured', message: 'Google Play is not configured.' }, { status: 503 });
    const synced = await syncGooglePurchase(createAdminClient(), config, change.purchaseToken);
    return ok({ outcome: synced.outcome });
  } catch (error) {
    // A token Google no longer knows, or a product we do not sell, will not get better with retries.
    if (error instanceof GooglePlayError && [404, 422].includes(error.status)) return ok({ ignored: true });
    console.error('[google-play] notification failed', {
      type: notification.subscriptionNotification?.notificationType ?? null,
      message: error instanceof Error ? error.message : error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    });
    return NextResponse.json({ code: 'internal', message: 'Notification not processed.' }, { status: 500 });
  }
}
