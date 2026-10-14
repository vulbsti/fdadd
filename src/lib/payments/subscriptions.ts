import type { SupabaseClient } from '@supabase/supabase-js';
import { getMembershipPlan, isPlanId, type PlanId } from './plans';

/**
 * One current membership row per person (public.subscriptions). People with
 * no row, or whose membership has lapsed, are on the Free plan. Rows are
 * written only by the server (service role); the owner can read their own.
 */

export const SUBSCRIPTION_STATUSES = ['active', 'in_grace', 'on_hold', 'paused', 'canceled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type SubscriptionSource = 'google_play' | 'razorpay' | 'manual';

export interface SubscriptionRow {
  user_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  current_period_end: string | null;
  auto_renewing: boolean;
  google_purchase_token: string | null;
  google_order_id: string | null;
  raw_state: unknown;
  created_at?: string;
  updated_at?: string;
}

export const SUBSCRIPTION_COLUMNS = 'user_id,plan_id,status,source,current_period_end,auto_renewing,google_purchase_token,google_order_id,raw_state,created_at,updated_at';

/** Database codes for a table or column that does not exist yet (migration not applied). */
const MISSING_SCHEMA = new Set(['PGRST202', 'PGRST205', '42P01', '42703']);

export function isMissingSchema(error: { code?: unknown } | null | undefined): boolean {
  return Boolean(error && MISSING_SCHEMA.has(String(error.code)));
}

/**
 * Whether the row still gives its plan. Active and grace rows do; a cancelled
 * one does until the paid month ends. A known end date in the past always
 * wins, so a missed "expired" notification cannot keep a plan open forever.
 */
export function hasEntitlement(row: Pick<SubscriptionRow, 'status' | 'current_period_end'> | null, now = new Date()): boolean {
  if (!row || !['active', 'in_grace', 'canceled'].includes(row.status)) return false;
  if (!row.current_period_end) return row.status !== 'canceled';
  return Date.parse(row.current_period_end) > now.getTime();
}

export function effectivePlanId(row: Pick<SubscriptionRow, 'status' | 'current_period_end' | 'plan_id'> | null, now = new Date()): PlanId {
  return row && hasEntitlement(row, now) && isPlanId(row.plan_id) ? row.plan_id : 'free';
}

export interface PlanSummary {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** The membership row's status, or 'none' when the person never had one. */
  status: SubscriptionStatus | 'none';
  source: SubscriptionSource | null;
  /** When the next monthly charge is due; null unless the membership renews by itself. */
  renewsAt: string | null;
  questionsUsed: number;
  questionsLimit: number;
  /** The end of the paid month (paid plans), or null. */
  periodEnd: string | null;
  /** When the monthly question count starts again (first day of next month, UTC). */
  questionsResetAt: string;
}

export function planSummary(row: SubscriptionRow | null, questionsUsed: number, now = new Date()): PlanSummary {
  const plan = getMembershipPlan(effectivePlanId(row, now));
  const entitled = hasEntitlement(row, now);
  return {
    id: plan.id, name: plan.name, priceUsdMonthly: plan.priceUsdMonthly,
    status: row?.status ?? 'none', source: row?.source ?? null,
    renewsAt: entitled && row?.auto_renewing && row.status === 'active' ? row.current_period_end : null,
    questionsUsed, questionsLimit: plan.monthlyQuestions,
    periodEnd: row?.current_period_end ?? null,
    questionsResetAt: nextMonthStartUtc(now).toISOString(),
  };
}

export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** The person's membership row, read with their own client (or the admin client). */
export async function readSubscription(client: SupabaseClient, userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await client.from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * Questions asked this calendar month (UTC): the person's own chat turns in
 * astro_messages. Answers to the assistant's follow-up questions count too;
 * they are turns the person typed.
 */
export async function countQuestionsThisMonth(client: SupabaseClient, userId: string, now = new Date()): Promise<number> {
  const { count, error } = await client.from('astro_messages').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('role', 'user').gte('created_at', monthStartUtc(now).toISOString());
  if (error) throw error;
  return count ?? 0;
}

export function planLimitsEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.PLAN_LIMITS_ENFORCED?.trim().toLowerCase() === 'true';
}

export interface QuestionAllowance { allowed: boolean; summary: PlanSummary }

export async function questionAllowance(client: SupabaseClient, userId: string, now = new Date()): Promise<QuestionAllowance> {
  const [row, used] = await Promise.all([readSubscription(client, userId), countQuestionsThisMonth(client, userId, now)]);
  const summary = planSummary(row, used, now);
  return { allowed: used < summary.questionsLimit, summary };
}

export function quotaExceededMessage(summary: PlanSummary): string {
  const reset = new Date(summary.questionsResetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  return summary.id === 'pro'
    ? `You have used all ${summary.questionsLimit} questions for this month. Your questions start again on ${reset}.`
    : `You have used all ${summary.questionsLimit} questions in your ${summary.name} plan this month. They start again on ${reset}, or you can move to a bigger plan for more room now.`;
}
