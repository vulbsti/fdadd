export const AIDORAA_ACCESS_PLAN_ID = 'aidoraa-access';

export type PaymentPlan = {
  id: typeof AIDORAA_ACCESS_PLAN_ID;
  name: string;
  description: string;
  amount: number;
  currency: 'INR';
};

export function getAccessPlan(): PaymentPlan | null {
  const rawAmount = process.env.AIDORAA_PAYMENT_AMOUNT_PAISE?.trim();
  if (!rawAmount) return null;

  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('AIDORAA_PAYMENT_AMOUNT_PAISE must be a positive integer.');
  }

  const currency = (process.env.AIDORAA_PAYMENT_CURRENCY || 'INR').trim().toUpperCase();
  if (currency !== 'INR') {
    throw new Error('The initial Aidoraa checkout supports INR only.');
  }

  return {
    id: AIDORAA_ACCESS_PLAN_ID,
    name: process.env.AIDORAA_PAYMENT_PLAN_NAME?.trim() || 'Aidoraa access',
    description: 'One-time Aidoraa access payment',
    amount,
    currency: 'INR',
  };
}

export function requirePaymentPlan(planId: string): PaymentPlan {
  if (planId !== AIDORAA_ACCESS_PLAN_ID) {
    throw new Error('Unknown payment plan.');
  }

  const plan = getAccessPlan();
  if (!plan) {
    throw new Error('Payment pricing is not configured.');
  }

  return plan;
}
