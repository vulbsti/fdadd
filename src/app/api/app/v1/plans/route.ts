import { appJson } from '@/lib/app/http';
import { appVersionGate } from '@/lib/app/version';
import { plansForApp } from '@/lib/payments/plans';

/** The membership catalog for the app's plans screen. Public: prices are not private. */
export function GET(request: Request) {
  return appVersionGate(request) ?? appJson({ currency: 'USD', billingPeriod: 'monthly', plans: plansForApp() });
}
