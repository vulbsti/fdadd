import type { SupabaseClient } from '@supabase/supabase-js';
import {
  acknowledgeGoogleSubscription, fetchGoogleSubscription, googleSubscriptionRow, GooglePlayError, resolveGooglePurchase,
  shouldReplaceSubscription, type GooglePlayConfig,
} from './google-play';
import { GOOGLE_PLAY_SUBSCRIPTION_ID } from './plans';
import { SUBSCRIPTION_COLUMNS, type SubscriptionRow } from './subscriptions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rowWhere(admin: SupabaseClient, column: 'user_id' | 'google_purchase_token', value: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin.from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq(column, value).maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow | null) ?? null;
}

export type GoogleSyncResult =
  | { outcome: 'saved' | 'kept'; userId: string; row: SubscriptionRow }
  | { outcome: 'unclaimed' };

/**
 * Re-read a purchase from Google and store it on its owner's row (admin
 * client). With `claimingUserId` (the app's verify call) the purchase must
 * have been made for that account and must not already belong to someone
 * else. Without it (a notification) the owner is whoever holds the token or
 * the purchase it replaced, or the account the app named at purchase time.
 */
export async function syncGooglePurchase(admin: SupabaseClient, config: GooglePlayConfig, purchaseToken: string,
  options: { claimingUserId?: string } = {}): Promise<GoogleSyncResult> {
  const purchase = await fetchGoogleSubscription(config, purchaseToken);
  const resolved = resolveGooglePurchase(purchase);
  const holder = await rowWhere(admin, 'google_purchase_token', purchaseToken);
  const linked = resolved.linkedPurchaseToken ? await rowWhere(admin, 'google_purchase_token', resolved.linkedPurchaseToken) : null;

  let userId: string | null;
  if (options.claimingUserId) {
    if (resolved.accountId && resolved.accountId !== options.claimingUserId) {
      throw new GooglePlayError(403, 'This purchase was made for a different Aidoraa account.');
    }
    if (holder && holder.user_id !== options.claimingUserId) {
      throw new GooglePlayError(409, 'This purchase is already linked to a different Aidoraa account.');
    }
    userId = options.claimingUserId;
  } else {
    userId = holder?.user_id ?? linked?.user_id ?? (resolved.accountId && UUID.test(resolved.accountId) ? resolved.accountId : null);
  }
  if (!userId) return { outcome: 'unclaimed' };

  const incoming = googleSubscriptionRow(userId, purchaseToken, purchase, resolved);
  const existing = await rowWhere(admin, 'user_id', userId);
  let row = existing;
  let outcome: 'saved' | 'kept' = 'kept';
  if (shouldReplaceSubscription(existing, { ...incoming, linkedPurchaseToken: resolved.linkedPurchaseToken })) {
    const saved = await admin.from('subscriptions').upsert(incoming, { onConflict: 'user_id' }).select(SUBSCRIPTION_COLUMNS).single();
    if (saved.error?.code === '23505') throw new GooglePlayError(409, 'This purchase is already linked to a different Aidoraa account.');
    // The account named in the purchase no longer exists (or never did).
    if (saved.error?.code === '23503') return { outcome: 'unclaimed' };
    if (saved.error) throw saved.error;
    row = saved.data as SubscriptionRow;
    outcome = 'saved';
  }
  // The replaced purchase no longer gives a plan, wherever it is still recorded.
  if (linked && linked.user_id !== userId) {
    const ended = await admin.from('subscriptions').update({ status: 'expired', auto_renewing: false })
      .eq('user_id', linked.user_id).eq('google_purchase_token', resolved.linkedPurchaseToken!);
    if (ended.error) throw ended.error;
  }
  if (resolved.acknowledgementPending && (resolved.status === 'active' || resolved.status === 'in_grace')) {
    await acknowledgeGoogleSubscription(config, GOOGLE_PLAY_SUBSCRIPTION_ID, purchaseToken).catch((error) => {
      // Retried by the next verify or notification; Google allows three days.
      console.error('[google-play] acknowledge failed', { message: error instanceof Error ? error.message : 'unknown' });
    });
  }
  return { outcome, userId, row: row ?? incoming };
}

/** A refund or chargeback: the purchase stops giving a plan straight away. */
export async function voidGooglePurchase(admin: SupabaseClient, purchaseToken: string) {
  const ended = await admin.from('subscriptions').update({ status: 'expired', auto_renewing: false })
    .eq('google_purchase_token', purchaseToken);
  if (ended.error) throw ended.error;
}
