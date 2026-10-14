/**
 * Membership plans (monthly, USD). Every plan has every feature; a higher plan
 * gives more room. The Razorpay one-time INR access flow in catalog.ts is
 * separate and unchanged.
 */

export const PLAN_IDS = ['free', 'basic', 'plus', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Questions a person can ask per calendar month (UTC). Change these to resize the plans. */
export const FREE_MONTHLY_QUESTIONS = 10;
export const BASIC_MONTHLY_QUESTIONS = 150;
export const PLUS_MONTHLY_QUESTIONS = 800;
export const PRO_MONTHLY_QUESTIONS = 3000;

/** One Google Play subscription product; each paid plan is one of its monthly base plans. */
export const GOOGLE_PLAY_PACKAGE_NAME = 'com.aidoraa.app';
export const GOOGLE_PLAY_SUBSCRIPTION_ID = 'aidoraa_membership';

export interface MembershipPlan {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** One line shown under the plan name. */
  promise: string;
  monthlyQuestions: number;
  googlePlay: { productId: string; basePlanId: string } | null;
}

export const MEMBERSHIP_PLANS: readonly MembershipPlan[] = [
  {
    id: 'free', name: 'Free', priceUsdMonthly: 0,
    promise: 'Try everything and get to know yourself a little better.',
    monthlyQuestions: FREE_MONTHLY_QUESTIONS, googlePlay: null,
  },
  {
    id: 'basic', name: 'Basic', priceUsdMonthly: 5,
    promise: 'Room for a steady habit of checking in with yourself.',
    monthlyQuestions: BASIC_MONTHLY_QUESTIONS,
    googlePlay: { productId: GOOGLE_PLAY_SUBSCRIPTION_ID, basePlanId: 'basic-monthly' },
  },
  {
    id: 'plus', name: 'Plus', priceUsdMonthly: 20,
    promise: 'Plenty of room to think through work, family and the people around you.',
    monthlyQuestions: PLUS_MONTHLY_QUESTIONS,
    googlePlay: { productId: GOOGLE_PLAY_SUBSCRIPTION_ID, basePlanId: 'plus-monthly' },
  },
  {
    id: 'pro', name: 'Pro', priceUsdMonthly: 60,
    promise: 'The most room, for daily use and the big decisions.',
    monthlyQuestions: PRO_MONTHLY_QUESTIONS,
    googlePlay: { productId: GOOGLE_PLAY_SUBSCRIPTION_ID, basePlanId: 'pro-monthly' },
  },
];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function getMembershipPlan(id: PlanId): MembershipPlan {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === id)!;
}

/** The paid plan a Google Play base plan sells, or null for one we do not sell. */
export function planForGoogleBasePlan(productId: string | null | undefined, basePlanId: string | null | undefined): MembershipPlan | null {
  if (!productId || !basePlanId) return null;
  return MEMBERSHIP_PLANS.find((plan) => plan.googlePlay?.productId === productId && plan.googlePlay.basePlanId === basePlanId) ?? null;
}

/** The catalog as the app's plans screen shows it. */
export function plansForApp() {
  return MEMBERSHIP_PLANS.map((plan) => ({
    id: plan.id, name: plan.name, priceUsdMonthly: plan.priceUsdMonthly, promise: plan.promise,
    monthlyQuestions: plan.monthlyQuestions, googlePlay: plan.googlePlay,
  }));
}
