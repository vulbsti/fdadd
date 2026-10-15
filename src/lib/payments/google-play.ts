import { createSign } from 'node:crypto';
import { GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_PLAY_SUBSCRIPTION_ID, planForGoogleBasePlan, type PlanId } from './plans';
import { hasEntitlement, type SubscriptionRow, type SubscriptionStatus } from './subscriptions';

/**
 * Google Play Billing, server side: read a subscription purchase from the
 * Google Play Developer API and turn it into our subscriptions row. The
 * service account key stays on the server (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
 * the app only ever sends us its purchase token.
 */

const ANDROID_PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export class GooglePlayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface GooglePlayConfig { clientEmail: string; privateKey: string; tokenUri: string }

/** The service account, from raw JSON or base64 JSON. Null when billing is not configured. */
export function googlePlayConfig(env: Record<string, string | undefined> = process.env): GooglePlayConfig | null {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let parsed: { client_email?: unknown; private_key?: unknown; token_uri?: unknown };
  try {
    parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid service account JSON.');
  }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON needs client_email and private_key.');
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    tokenUri: typeof parsed.token_uri === 'string' ? parsed.token_uri : DEFAULT_TOKEN_URI,
  };
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** A signed RS256 assertion for the OAuth JWT bearer flow. */
export function serviceAccountAssertion(config: GooglePlayConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: config.clientEmail, scope: SCOPE, aud: config.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600,
  }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(config.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

let cachedToken: { clientEmail: string; token: string; expiresAt: number } | null = null;

/** An access token for the Android Publisher API, reused until a minute before it expires. */
export async function googlePlayAccessToken(config: GooglePlayConfig): Promise<string> {
  if (cachedToken && cachedToken.clientEmail === config.clientEmail && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }
  const response = await fetch(config.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountAssertion(config) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) throw new GooglePlayError(502, `Google sign-in for Play billing failed (${response.status}).`);
  cachedToken = { clientEmail: config.clientEmail, token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function publisherFetch(config: GooglePlayConfig, path: string, init: RequestInit = {}) {
  const token = await googlePlayAccessToken(config);
  const response = await fetch(`${ANDROID_PUBLISHER}/applications/${GOOGLE_PLAY_PACKAGE_NAME}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // 400/404/410: the token is unknown, malformed or too old to look up.
    const status = [400, 404, 410].includes(response.status) ? 404 : response.status === 401 || response.status === 403 ? 503 : 502;
    throw new GooglePlayError(status, `Google Play request failed (${response.status}).`);
  }
  return response;
}

// --- Google's SubscriptionPurchaseV2 (the fields we use) --------------------

export interface GoogleSubscriptionLineItem {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
  prepaidPlan?: { allowExtendAfterTime?: string };
  offerDetails?: { basePlanId?: string; offerId?: string };
}

export interface GoogleSubscriptionPurchaseV2 {
  kind?: string;
  startTime?: string;
  regionCode?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string; obfuscatedExternalProfileId?: string };
  lineItems?: GoogleSubscriptionLineItem[];
}

export async function fetchGoogleSubscription(config: GooglePlayConfig, purchaseToken: string): Promise<GoogleSubscriptionPurchaseV2> {
  const response = await publisherFetch(config, `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  return await response.json() as GoogleSubscriptionPurchaseV2;
}

/** Google refunds a purchase that is not acknowledged within three days. */
export async function acknowledgeGoogleSubscription(config: GooglePlayConfig, productId: string, purchaseToken: string) {
  await publisherFetch(config, `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', body: '{}' });
}

/** Stop future renewals; the paid month stays usable. */
export async function cancelGoogleSubscription(config: GooglePlayConfig, productId: string, purchaseToken: string) {
  await publisherFetch(config, `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:cancel`,
    { method: 'POST' });
}

// --- Pure mapping -------------------------------------------------------------

const STATE_MAP: Record<string, SubscriptionStatus> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'in_grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  // Payment not yet completed (e.g. cash at a shop): no access yet, may still become active.
  SUBSCRIPTION_STATE_PENDING: 'on_hold',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

export function mapGoogleSubscriptionState(state: string | null | undefined): SubscriptionStatus | null {
  return state ? STATE_MAP[state] ?? null : null;
}

export interface ResolvedGooglePurchase {
  planId: PlanId;
  basePlanId: string;
  status: SubscriptionStatus;
  periodEnd: string | null;
  autoRenewing: boolean;
  orderId: string | null;
  linkedPurchaseToken: string | null;
  accountId: string | null;
  acknowledgementPending: boolean;
}

/**
 * Our view of a Google purchase: which plan it pays for (from the line item's
 * base plan), its state, and until when it is paid. Throws for a purchase of
 * a product or base plan we do not sell, or an unknown state.
 */
export function resolveGooglePurchase(purchase: GoogleSubscriptionPurchaseV2): ResolvedGooglePurchase {
  const status = mapGoogleSubscriptionState(purchase.subscriptionState);
  if (!status) throw new GooglePlayError(422, `Unknown subscription state ${purchase.subscriptionState ?? '(none)'}.`);
  // During a plan change Google can list more than one item; the one that runs longest is current.
  const items = (purchase.lineItems ?? []).filter((item) => item.productId === GOOGLE_PLAY_SUBSCRIPTION_ID)
    .sort((a, b) => Date.parse(b.expiryTime ?? '') - Date.parse(a.expiryTime ?? ''));
  const item = items.find((entry) => planForGoogleBasePlan(entry.productId, entry.offerDetails?.basePlanId));
  const plan = item && planForGoogleBasePlan(item.productId, item.offerDetails?.basePlanId);
  if (!item || !plan) throw new GooglePlayError(422, 'This purchase is not an Aidoraa membership plan.');
  const expiry = item.expiryTime && !Number.isNaN(Date.parse(item.expiryTime)) ? new Date(item.expiryTime).toISOString() : null;
  return {
    planId: plan.id,
    basePlanId: plan.googlePlay!.basePlanId,
    status,
    periodEnd: expiry,
    autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true,
    orderId: purchase.latestOrderId ?? item.latestSuccessfulOrderId ?? null,
    linkedPurchaseToken: purchase.linkedPurchaseToken || null,
    accountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
    acknowledgementPending: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}

export function googleSubscriptionRow(userId: string, purchaseToken: string, purchase: GoogleSubscriptionPurchaseV2,
  resolved = resolveGooglePurchase(purchase)): SubscriptionRow {
  return {
    user_id: userId,
    plan_id: resolved.planId,
    status: resolved.status,
    source: 'google_play',
    current_period_end: resolved.periodEnd,
    auto_renewing: resolved.autoRenewing,
    google_purchase_token: purchaseToken,
    google_order_id: resolved.orderId,
    raw_state: purchase,
  };
}

/**
 * Whether an incoming purchase may overwrite the person's current row. The
 * same purchase, or the purchase it replaced (upgrade, downgrade,
 * resubscribe), always updates; a different purchase only takes over when it
 * gives a plan or the current row no longer does, so a stray "expired" event
 * for an old purchase cannot end a membership that is running.
 */
export function shouldReplaceSubscription(
  existing: Pick<SubscriptionRow, 'status' | 'current_period_end' | 'google_purchase_token'> | null,
  incoming: Pick<SubscriptionRow, 'status' | 'current_period_end' | 'google_purchase_token'> & { linkedPurchaseToken?: string | null },
  now = new Date(),
): boolean {
  if (!existing) return true;
  if (existing.google_purchase_token && existing.google_purchase_token === incoming.google_purchase_token) return true;
  if (existing.google_purchase_token && existing.google_purchase_token === incoming.linkedPurchaseToken) return true;
  return hasEntitlement(incoming, now) || !hasEntitlement(existing, now);
}

/** Pub/Sub push body for Real-time developer notifications. */
export interface GoogleRtdn {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { version?: string; notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  oneTimeProductNotification?: unknown;
  testNotification?: unknown;
}

export function decodeRtdn(body: unknown): GoogleRtdn | null {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== 'string') return null;
  try {
    const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as unknown;
    return decoded && typeof decoded === 'object' ? decoded as GoogleRtdn : null;
  } catch {
    return null;
  }
}
