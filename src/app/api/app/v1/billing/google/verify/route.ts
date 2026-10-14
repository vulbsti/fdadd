import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appError, appFailure, appJson, requireAppUser } from '@/lib/app/http';
import { GooglePlayError, googlePlayConfig } from '@/lib/payments/google-play';
import { syncGooglePurchase } from '@/lib/payments/google-play-sync';
import { GOOGLE_PLAY_SUBSCRIPTION_ID } from '@/lib/payments/plans';
import { countQuestionsThisMonth, planSummary } from '@/lib/payments/subscriptions';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const verifySchema = z.object({
  productId: z.literal(GOOGLE_PLAY_SUBSCRIPTION_ID),
  // A hint only: the plan always comes from what Google reports for the token.
  basePlanId: z.string().max(100).optional(),
  purchaseToken: z.string().min(10).max(4096),
}).strict();

const ERROR_CODES: Record<number, [string, string]> = {
  403: ['purchase_account_mismatch', 'This purchase belongs to a different Aidoraa account.'],
  404: ['purchase_not_found', 'Google Play could not find this purchase.'],
  409: ['purchase_already_linked', 'This purchase is already linked to a different Aidoraa account.'],
  422: ['purchase_not_supported', 'This purchase is not an Aidoraa membership.'],
};

/** The app hands over a Google Play purchase; we check it with Google and record the membership. */
export async function POST(request: Request) {
  const context = await requireAppUser(request);
  if (context instanceof NextResponse) return context;
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, 'invalid_request', 'That purchase could not be read.');
  let config;
  try {
    config = googlePlayConfig();
  } catch (error) {
    return appFailure('google play config', error);
  }
  if (!config) return appError(503, 'unconfigured', 'Google Play purchases are not available yet.');
  try {
    const synced = await syncGooglePurchase(createAdminClient(), config, parsed.data.purchaseToken, { claimingUserId: context.userId });
    const questionsUsed = await countQuestionsThisMonth(context.client, context.userId);
    const row = synced.outcome === 'unclaimed' ? null : synced.row;
    return appJson({ plan: planSummary(row, questionsUsed) });
  } catch (error) {
    if (error instanceof GooglePlayError) {
      const known = ERROR_CODES[error.status];
      if (known) return appError(error.status, known[0], known[1]);
      console.error('[google-play] verify failed', { status: error.status, message: error.message });
      return appError(error.status === 503 ? 503 : 502, 'store_unavailable', 'Google Play could not be reached. Please try again in a moment.');
    }
    return appFailure('google play verify', error);
  }
}
