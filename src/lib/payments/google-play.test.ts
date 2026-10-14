import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeRtdn, googlePlayConfig, googleSubscriptionRow, mapGoogleSubscriptionState, resolveGooglePurchase,
  serviceAccountAssertion, shouldReplaceSubscription, type GoogleSubscriptionPurchaseV2,
} from './google-play';
import active from './fixtures/google-subscription-active.json';
import upgraded from './fixtures/google-subscription-upgraded.json';
import canceled from './fixtures/google-subscription-canceled.json';

const userId = '6c1f0f5e-2b7c-4d39-9a51-0d8a3f6b2e11';
const now = new Date('2026-10-14T12:00:00Z');

describe('google play subscription mapping', () => {
  it('maps every Google state to ours', () => {
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_ACTIVE')).toBe('active');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).toBe('in_grace');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_ON_HOLD')).toBe('on_hold');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_PAUSED')).toBe('paused');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_CANCELED')).toBe('canceled');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_EXPIRED')).toBe('expired');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_PENDING')).toBe('on_hold');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')).toBe('expired');
    expect(mapGoogleSubscriptionState('SUBSCRIPTION_STATE_UNSPECIFIED')).toBeNull();
  });

  it('resolves the plan, period and account of a new purchase', () => {
    expect(resolveGooglePurchase(active)).toEqual({
      planId: 'plus', basePlanId: 'plus-monthly', status: 'active', periodEnd: '2026-11-01T09:12:40.000Z', autoRenewing: true,
      orderId: 'GPA.3312-4410-2231-55120', linkedPurchaseToken: null, accountId: userId, acknowledgementPending: true,
    });
  });

  it('takes the longest-running line item after an upgrade and keeps the replaced token', () => {
    const resolved = resolveGooglePurchase(upgraded);
    expect(resolved).toMatchObject({ planId: 'pro', autoRenewing: true, linkedPurchaseToken: 'old-basic-token', acknowledgementPending: false });
    expect(resolved.periodEnd).toBe('2026-11-10T15:00:00.000Z');
  });

  it('keeps a cancelled membership until the paid month ends', () => {
    const row = googleSubscriptionRow(userId, 'token-3', canceled);
    expect(row).toMatchObject({ plan_id: 'basic', status: 'canceled', source: 'google_play', auto_renewing: false,
      google_purchase_token: 'token-3', current_period_end: '2026-11-03T08:00:00.000Z' });
    expect(row.raw_state).toBe(canceled);
  });

  it('refuses products and base plans we do not sell', () => {
    const other: GoogleSubscriptionPurchaseV2 = { ...active, lineItems: [{ productId: 'aidoraa_membership', offerDetails: { basePlanId: 'gold-yearly' } }] };
    expect(() => resolveGooglePurchase(other)).toThrow(/not an Aidoraa membership/);
    expect(() => resolveGooglePurchase({ ...active, lineItems: [{ productId: 'other_app', offerDetails: { basePlanId: 'plus-monthly' } }] })).toThrow();
    expect(() => resolveGooglePurchase({ ...active, subscriptionState: 'SUBSCRIPTION_STATE_UNSPECIFIED' })).toThrow(/Unknown subscription state/);
  });
});

describe('which purchase owns the row', () => {
  const running = { status: 'active' as const, current_period_end: '2026-11-01T00:00:00Z', google_purchase_token: 'a' };
  const lapsed = { status: 'expired' as const, current_period_end: '2026-09-01T00:00:00Z', google_purchase_token: 'b' };

  it('always updates the same purchase or the one it replaced', () => {
    expect(shouldReplaceSubscription(running, { ...lapsed, google_purchase_token: 'a' }, now)).toBe(true);
    expect(shouldReplaceSubscription(running, { ...lapsed, google_purchase_token: 'c', linkedPurchaseToken: 'a' }, now)).toBe(true);
    expect(shouldReplaceSubscription(null, lapsed, now)).toBe(true);
  });

  it('does not let an old purchase end a running membership', () => {
    expect(shouldReplaceSubscription(running, lapsed, now)).toBe(false);
    expect(shouldReplaceSubscription(lapsed, running, now)).toBe(true);
  });
});

describe('google play plumbing', () => {
  it('reads the service account from JSON or base64', () => {
    const json = JSON.stringify({ client_email: 'play@aidoraa.iam.gserviceaccount.com', private_key: 'line1\\nline2' });
    expect(googlePlayConfig({})).toBeNull();
    expect(googlePlayConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: json })).toEqual({
      clientEmail: 'play@aidoraa.iam.gserviceaccount.com', privateKey: 'line1\nline2', tokenUri: 'https://oauth2.googleapis.com/token' });
    expect(googlePlayConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString('base64') })?.clientEmail).toBe('play@aidoraa.iam.gserviceaccount.com');
    expect(() => googlePlayConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{"client_email":1}' })).toThrow();
  });

  it('signs a verifiable RS256 assertion for the publisher scope', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = { clientEmail: 'play@x.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      tokenUri: 'https://oauth2.googleapis.com/token' };
    const [header, claims, signature] = serviceAccountAssertion(config, 1_800_000_000).split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/androidpublisher', aud: config.tokenUri, iat: 1_800_000_000, exp: 1_800_003_600 });
    expect(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('decodes Pub/Sub notifications and ignores anything else', () => {
    const notification = { version: '1.0', packageName: 'com.aidoraa.app', subscriptionNotification: { notificationType: 4, purchaseToken: 't' } };
    expect(decodeRtdn({ message: { data: Buffer.from(JSON.stringify(notification)).toString('base64') } })).toEqual(notification);
    expect(decodeRtdn({ message: { data: 'not base64 json' } })).toBeNull();
    expect(decodeRtdn(null)).toBeNull();
  });
});
