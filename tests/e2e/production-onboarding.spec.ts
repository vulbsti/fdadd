import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { randomUUID } from 'node:crypto';
import { Agent, setGlobalDispatcher } from 'undici';

const productionOrigin = 'https://www.aidoraa.com';
const productionProjectRef = 'ezanfqbewuqttatrkvhf';
const projectHost = `${productionProjectRef}.supabase.co`;

if (process.env.P3_PRODUCTION_SMOKE !== '1') {
  throw new Error('Production smoke requires P3_PRODUCTION_SMOKE=1.');
}

const supabaseUrl = process.env.P3_PRODUCTION_SUPABASE_URL?.trim();
const supabaseSecret = process.env.P3_PRODUCTION_SUPABASE_SECRET_KEY?.trim();
const supabasePublishable = process.env.P3_PRODUCTION_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabaseIp = process.env.P3_PRODUCTION_SUPABASE_IP?.trim();
if (!supabaseUrl || !supabaseSecret || !supabasePublishable || !supabaseIp) {
  throw new Error('Production smoke requires explicit production Supabase credentials and DNS pin.');
}
const parsedSupabaseUrl = new URL(supabaseUrl);
if (parsedSupabaseUrl.href !== `https://${projectHost}/` || parsedSupabaseUrl.username || parsedSupabaseUrl.password
  || parsedSupabaseUrl.search || parsedSupabaseUrl.hash
  || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(supabaseIp)
  || !supabaseIp.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)) {
  throw new Error('Production smoke refuses any target other than www.aidoraa.com and the pinned production Supabase project.');
}

const supabaseAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      if (hostname === projectHost) {
        callback(null, [{ address: supabaseIp, family: 4 }]);
        return;
      }
      systemLookup(hostname, options, callback);
    },
  },
});
setGlobalDispatcher(supabaseAgent);

async function signInVisibly(page: Page, email: string, password: string) {
  await page.goto('/');
  expect(new URL(page.url()).origin).toBe(productionOrigin);
  if (await page.getByRole('button', { name: /open navigation/i }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /open navigation/i }).click();
  }
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).origin).toBe(productionOrigin);
}

function cookieChunkIndex(name: string, storageKey: string): number {
  if (name === storageKey) return -1;
  const suffix = name.slice(storageKey.length + 1);
  return /^\d+$/.test(suffix) ? Number(suffix) : Number.MAX_SAFE_INTEGER;
}

async function readSignedInAccessToken(page: Page): Promise<string> {
  const storageKey = `sb-${productionProjectRef}-auth-token`;
  const cookies = (await page.context().cookies(productionOrigin))
    .filter(({ name }) => {
      if (name === storageKey) return true;
      const suffix = name.startsWith(`${storageKey}.`) ? name.slice(storageKey.length + 1) : '';
      return /^\d+$/.test(suffix);
    })
    .sort((a, b) => cookieChunkIndex(a.name, storageKey) - cookieChunkIndex(b.name, storageKey));
  const encoded = cookies.map(({ value }) => {
    try { return decodeURIComponent(value); } catch { return value; }
  }).join('');
  if (!encoded) throw new Error('Visible sign-in succeeded but its scoped auth session cookie was not found.');
  const json = encoded.startsWith('base64-')
    ? Buffer.from(encoded.slice('base64-'.length), 'base64url').toString('utf8')
    : encoded;
  const session = JSON.parse(json) as { access_token?: unknown };
  if (typeof session.access_token !== 'string' || session.access_token.length < 20) {
    throw new Error('Visible sign-in session does not contain a valid access token.');
  }
  return session.access_token;
}

async function startPrivateTrace(page: Page, testInfo: TestInfo) {
  await page.context().tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
    title: 'production-onboarding-after-visible-sign-in',
  });
  testInfo.annotations.push({
    type: 'private-trace',
    description: 'Trace capture starts after visible sign-in; output remains under ignored test-results/production-smoke-private.',
  });
}

async function captureWidths(page: Page, testInfo: TestInfo, state: string) {
  const viewports = [
    { name: 'desktop-1586x992', width: 1586, height: 992 },
    { name: 'laptop-1366x768', width: 1366, height: 768 },
    { name: 'mobile-390x844', width: 390, height: 844 },
  ];
  const overflows: number[] = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      overflows.push(viewport.width);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${state}-${viewport.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  expect(overflows, `${state} has horizontal overflow at the listed viewport widths`).toEqual([]);
}

async function cleanupUser(
  admin: SupabaseClient,
  userId: string,
  accessToken: string | null,
) {
  let revokeError: Error | null = null;
  if (accessToken) {
    try {
      const revoked = await admin.auth.admin.signOut(accessToken, 'global');
      if (revoked.error) revokeError = revoked.error;
    } catch (error) {
      revokeError = error instanceof Error ? error : new Error('Session revocation failed.');
    }
  }
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error && deleted.error.code !== 'user_not_found') throw deleted.error;
  if (revokeError) throw new Error(`Disposable user was deleted, but session revocation failed: ${revokeError.message}`);
}

test('production name-only onboarding creates and retains the same owned life map', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const admin = createClient(supabaseUrl, supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const publishableClient = createClient(supabaseUrl, supabasePublishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `system-prod-smoke-${randomUUID()}@example.invalid`;
  const password = `Production-Smoke-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Disposable production smoke user creation failed.');
  const userId = created.data.user.id;

  let accessToken: string | null = null;
  let personId: string | null = null;
  let traceStarted = false;
  let primaryFailure: unknown;
  try {
    await signInVisibly(page, email, password);
    accessToken = await readSignedInAccessToken(page);
    const verifiedSession = await publishableClient.auth.getUser(accessToken);
    if (verifiedSession.error || verifiedSession.data.user?.id !== userId) {
      throw verifiedSession.error ?? new Error('Visible sign-in session does not belong to the disposable production user.');
    }

    await startPrivateTrace(page, testInfo);
    traceStarted = true;
    await page.goto('/astrologer');
    await expect(page.getByRole('heading', { name: 'Whose life are we understanding?' })).toBeVisible();
    await captureWidths(page, testInfo, '01-name-only-onboarding');

    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/astrologer/profiles') && response.request().method() === 'POST');
    await page.getByLabel('Name').fill('Production smoke synthetic person');
    await page.getByRole('button', { name: /create personal map/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const payload = await response.json() as { profileId?: string };
    expect(payload.profileId).toMatch(/^[0-9a-f-]{36}$/i);
    personId = payload.profileId!;

    const lifeMapUrl = `/astrologer/p/${personId}/profile/life-map`;
    await expect(page).toHaveURL(`${productionOrigin}${lifeMapUrl}`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Your life map starts with what you choose to share.' })).toBeVisible();
    const ownedProfile = await admin.from('astro_profiles')
      .select('id,user_id,name,birth_date,birth_time,chart_json,sensitivity_json')
      .eq('id', personId).eq('user_id', userId).single();
    if (ownedProfile.error || !ownedProfile.data) {
      throw ownedProfile.error ?? new Error('Created profile was not found under the disposable user owner.');
    }
    expect(ownedProfile.data).toMatchObject({
      id: personId,
      user_id: userId,
      name: 'Production smoke synthetic person',
      birth_date: null,
      birth_time: null,
      chart_json: null,
      sensitivity_json: null,
    });
    await captureWidths(page, testInfo, '02-created-life-map');

    await page.reload();
    await expect(page).toHaveURL(`${productionOrigin}${lifeMapUrl}`);
    await expect(page.getByRole('heading', { name: 'Your life map starts with what you choose to share.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Life map' })).toBeVisible();
    const retainedProfile = await admin.from('astro_profiles').select('id,user_id,name')
      .eq('id', personId).eq('user_id', userId).single();
    if (retainedProfile.error || !retainedProfile.data) {
      throw retainedProfile.error ?? new Error('Life map reload did not retain the owned profile.');
    }
    expect(retainedProfile.data).toMatchObject({ id: personId, user_id: userId, name: 'Production smoke synthetic person' });
    await captureWidths(page, testInfo, '03-life-map-after-reload');
    testInfo.annotations.push({
      type: 'production-smoke-receipt',
      description: JSON.stringify({ userId, personId, screenshots: 'private test-results output at desktop, laptop, and mobile widths' }),
    });
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    const cleanupProblems: string[] = [];
    if (traceStarted) {
      try {
        await page.context().tracing.stop({ path: testInfo.outputPath('production-onboarding-private-trace.zip') });
      } catch {
        cleanupProblems.push('private trace could not be finalized');
      }
    }
    await page.context().clearCookies().catch(() => cleanupProblems.push('browser cookies could not be cleared'));
    await page.evaluate(() => localStorage.clear()).catch(() => cleanupProblems.push('browser storage could not be cleared'));
    try {
      await cleanupUser(admin, userId, accessToken);
    } catch {
      cleanupProblems.push('disposable user cleanup did not fully succeed');
    }
    if (cleanupProblems.length) {
      const cleanupError = new Error(`Production smoke cleanup issue: ${cleanupProblems.join('; ')}.`);
      if (primaryFailure) throw new AggregateError([primaryFailure, cleanupError], 'Production smoke and cleanup failed.');
      throw cleanupError;
    }
  }
});
