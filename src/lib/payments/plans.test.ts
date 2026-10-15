import { describe, expect, it } from 'vitest';
import { getMembershipPlan, MEMBERSHIP_PLANS, planForGoogleBasePlan, plansForApp } from './plans';
import { effectivePlanId, hasEntitlement, monthStartUtc, nextMonthStartUtc, planLimitsEnforced, planSummary, quotaExceededMessage,
  type SubscriptionRow } from './subscriptions';

const now = new Date('2026-10-14T12:00:00Z');
const row = (overrides: Partial<SubscriptionRow>): SubscriptionRow => ({
  user_id: 'u', plan_id: 'plus', status: 'active', source: 'google_play', current_period_end: '2026-11-01T00:00:00Z',
  auto_renewing: true, google_purchase_token: 't', google_order_id: 'o', raw_state: {}, ...overrides,
});

describe('membership plans', () => {
  it('sells four monthly USD tiers, one Play base plan per paid tier', () => {
    expect(MEMBERSHIP_PLANS.map((plan) => [plan.id, plan.priceUsdMonthly, plan.monthlyQuestions])).toEqual([
      ['free', 0, 10], ['basic', 5, 150], ['plus', 20, 800], ['pro', 60, 3000]]);
    expect(getMembershipPlan('free').googlePlay).toBeNull();
    expect(planForGoogleBasePlan('aidoraa_membership', 'pro-monthly')?.id).toBe('pro');
    expect(planForGoogleBasePlan('aidoraa_membership', 'pro-yearly')).toBeNull();
    expect(plansForApp()[1]).toMatchObject({ id: 'basic', googlePlay: { productId: 'aidoraa_membership', basePlanId: 'basic-monthly' } });
  });

  it('gives the plan only while the membership runs', () => {
    expect(effectivePlanId(null, now)).toBe('free');
    expect(effectivePlanId(row({}), now)).toBe('plus');
    expect(effectivePlanId(row({ status: 'in_grace' }), now)).toBe('plus');
    expect(effectivePlanId(row({ status: 'canceled' }), now)).toBe('plus');
    expect(effectivePlanId(row({ status: 'canceled', current_period_end: '2026-10-01T00:00:00Z' }), now)).toBe('free');
    expect(effectivePlanId(row({ status: 'active', current_period_end: '2026-10-01T00:00:00Z' }), now)).toBe('free');
    expect(effectivePlanId(row({ status: 'on_hold' }), now)).toBe('free');
    expect(hasEntitlement(row({ source: 'manual', current_period_end: null }), now)).toBe(true);
  });

  it('summarises the plan and the monthly allowance', () => {
    expect(planSummary(null, 3, now)).toEqual({ id: 'free', name: 'Free', priceUsdMonthly: 0, status: 'none', source: null, renewsAt: null,
      questionsUsed: 3, questionsLimit: 10, periodEnd: null, questionsResetAt: '2026-11-01T00:00:00.000Z' });
    expect(planSummary(row({}), 12, now)).toMatchObject({ id: 'plus', renewsAt: '2026-11-01T00:00:00Z', questionsLimit: 800 });
    expect(planSummary(row({ status: 'canceled', auto_renewing: false }), 0, now).renewsAt).toBeNull();
  });

  it('counts by calendar month in UTC', () => {
    expect(monthStartUtc(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(nextMonthStartUtc(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('enforces limits only when switched on', () => {
    expect(planLimitsEnforced({})).toBe(false);
    expect(planLimitsEnforced({ PLAN_LIMITS_ENFORCED: 'true' })).toBe(true);
    expect(quotaExceededMessage(planSummary(null, 10, now))).toContain('November 1');
  });
});
