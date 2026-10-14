import type { SupabaseClient } from '@supabase/supabase-js';
import { PI_BUCKET } from '@/lib/astro/pi-objects';
import { disconnectGoogle } from '@/lib/connectors/google';
import { edgeConfig, edgeObjects } from '@/lib/edge/client';
import { IMPORT_BUCKET } from '@/lib/imports/store';
import { cancelGoogleSubscription, googlePlayConfig } from '@/lib/payments/google-play';
import { GOOGLE_PLAY_SUBSCRIPTION_ID } from '@/lib/payments/plans';
import { isMissingSchema, readSubscription } from '@/lib/payments/subscriptions';

/**
 * Deleting an account. Postgres does most of it: every table that holds a
 * person's data references auth.users or astro_profiles with ON DELETE
 * CASCADE, so deleting the auth user removes profiles, people, conversations,
 * messages, the person model, runs, imports, connector tokens, membership and
 * app settings in one statement. Two kinds of rows are removed first:
 *   - payment_orders, whose foreign key is ON DELETE RESTRICT. Razorpay keeps
 *     its own record of every payment, so the local ledger rows are deleted.
 *   - person_exploration_contexts, which point at person_revision_objects ON
 *     DELETE RESTRICT and could otherwise fail the cascade depending on order.
 * Files live outside Postgres and are keyed by user id first
 * (`<userId>/<personId>/...`): Pi workspace archives and blobs, import
 * uploads and imported bodies, in Supabase Storage and in the edge R2 store.
 * Those are removed right after the user; anything that fails (or may be
 * written late by a run that was still working) is recorded in
 * account_deletion_cleanups and swept again by the daily cron.
 */

export type ObjectCleanup = 'storage:pi-workspaces' | 'storage:person-imports' | 'edge-objects';
const OBJECT_CLEANUPS: ObjectCleanup[] = ['storage:pi-workspaces', 'storage:person-imports', 'edge-objects'];

/** Every object path under a folder of a Supabase Storage bucket (list() is one level at a time). */
async function storagePaths(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) paths.push(...await storagePaths(admin, bucket, path));
      else paths.push(path);
    }
    if ((data?.length ?? 0) < 1000) return paths;
  }
}

async function removeStorageFolder(admin: SupabaseClient, bucket: string, folder: string) {
  const paths = await storagePaths(admin, bucket, folder);
  for (let index = 0; index < paths.length; index += 100) {
    const removed = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (removed.error) throw removed.error;
  }
}

async function cleanUp(admin: SupabaseClient, userId: string, step: ObjectCleanup) {
  if (step === 'storage:pi-workspaces') return removeStorageFolder(admin, PI_BUCKET, userId);
  if (step === 'storage:person-imports') return removeStorageFolder(admin, IMPORT_BUCKET, userId);
  const config = edgeConfig();
  if (!config) return;
  const objects = edgeObjects(config);
  const keys = await objects.list(`${userId}/`);
  if (keys.length) await objects.remove(keys);
}

/** Remove the person's stored files; returns the steps that failed. */
export async function removeUserObjects(admin: SupabaseClient, userId: string, steps = OBJECT_CLEANUPS): Promise<ObjectCleanup[]> {
  const failed: ObjectCleanup[] = [];
  await Promise.all(steps.map((step) => cleanUp(admin, userId, step).catch((error) => {
    console.error('[account-deletion] object cleanup failed', { step, message: error instanceof Error ? error.message : 'unknown' });
    failed.push(step);
  })));
  return failed;
}

export interface AccountDeletionResult {
  /** File cleanup steps that will be retried by the daily sweep. */
  pendingCleanup: ObjectCleanup[];
  /** False when a renewing Google Play membership could not be stopped from here. */
  googlePlayRenewalStopped: boolean | null;
}

export async function deleteAccount(input: {
  admin: SupabaseClient;
  userId: string;
  /** Revokes every session of the user: the app's token, or the cookie client. */
  signOut: () => Promise<unknown>;
}): Promise<AccountDeletionResult> {
  const { admin, userId } = input;

  // 1. Stop a Google Play renewal so a deleted account is not charged again.
  let googlePlayRenewalStopped: boolean | null = null;
  const subscription = await readSubscription(admin, userId);
  if (subscription?.source === 'google_play' && subscription.google_purchase_token && subscription.auto_renewing) {
    const config = googlePlayConfig();
    googlePlayRenewalStopped = config
      ? await cancelGoogleSubscription(config, GOOGLE_PLAY_SUBSCRIPTION_ID, subscription.google_purchase_token).then(() => true, (error) => {
        console.error('[account-deletion] Google Play renewal not stopped', { message: error instanceof Error ? error.message : 'unknown' });
        return false;
      })
      : false;
  }

  // 2. Revoke the Google Drive grant (the token row itself goes with the user).
  await disconnectGoogle(admin, userId).catch(() => null);

  // A run still working can write workspace files with its own short-lived
  // capability after the rows are gone; such accounts get a second sweep.
  const active = await admin.from('astro_agent_runs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'active');

  // 3. End every session, then the rows and the auth user.
  await input.signOut().catch(() => null);
  for (const table of ['person_exploration_contexts', 'payment_orders']) {
    const removed = await admin.from(table).delete().eq('user_id', userId);
    if (removed.error && !isMissingSchema(removed.error)) throw removed.error;
  }
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw deleted.error;

  // 4. Files outside Postgres.
  const pendingCleanup = await removeUserObjects(admin, userId);
  const queue = (active.count ?? 0) > 0 ? OBJECT_CLEANUPS : pendingCleanup;
  if (queue.length) {
    const queued = await admin.from('account_deletion_cleanups').upsert({ user_id: userId, pending: queue }, { onConflict: 'user_id' });
    if (queued.error) console.error('[account-deletion] cleanup could not be queued', { userId, pending: queue, code: queued.error.code });
  }
  return { pendingCleanup, googlePlayRenewalStopped };
}

/** Retry file cleanups left by earlier deletions. Called by the daily sweep. */
export async function retryAccountDeletionCleanups(admin: SupabaseClient, max = 10) {
  // Wait out the capability of any run that was still working at deletion.
  const settled = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from('account_deletion_cleanups').select('user_id,pending')
    .lt('requested_at', settled).order('updated_at').limit(max);
  if (error) {
    if (isMissingSchema(error)) return { retried: 0, finished: 0 };
    throw error;
  }
  let finished = 0;
  for (const row of data ?? []) {
    const steps = (row.pending as string[]).filter((step): step is ObjectCleanup => (OBJECT_CLEANUPS as string[]).includes(step));
    const failed = await removeUserObjects(admin, String(row.user_id), steps);
    const update = failed.length
      ? admin.from('account_deletion_cleanups').update({ pending: failed }).eq('user_id', row.user_id)
      : admin.from('account_deletion_cleanups').delete().eq('user_id', row.user_id);
    const saved = await update;
    if (saved.error) throw saved.error;
    if (!failed.length) finished++;
  }
  return { retried: data?.length ?? 0, finished };
}
