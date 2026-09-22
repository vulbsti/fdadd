import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function localSupabaseConfig(): { url: string; secretKey: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !secretKey || !publishableKey) {
    throw new Error(
      'P0 browser proof requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY.',
    );
  }
  const hostname = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error(`P0 browser proof refuses non-loopback Supabase host: ${hostname}`);
  }
  return { url, secretKey, publishableKey };
}

test('authenticated astrologer route survives reload and owned profiles API responds', async ({ page }, testInfo) => {
  const { url, secretKey } = localSupabaseConfig();
  const admin: SupabaseClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `p0-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.invalid`;
  const password = `P0-local-${crypto.randomUUID()}-Aa1!`;
  let userId: string | undefined;

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) {
      throw new Error(`Could not create disposable local auth user: ${created.error?.message ?? 'missing user'}`);
    }
    userId = created.data.user.id;

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: /toggle menu/i }).click();
    }
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // The submit handler performs the Supabase request asynchronously. Do not
    // navigate until the real auth modal closes; otherwise middleware can race
    // the cookie write and redirect the still-unauthenticated request home.
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });

    await page.goto('/astrologer');
    await expect(page).toHaveURL(/\/astrologer$/);
    await expect(page.getByRole('heading', { name: 'Whose life are we understanding?' })).toBeVisible();

    const profilesApi = await page.request.get('/api/astrologer/profiles');
    expect(profilesApi.status()).toBe(200);
    const payload = (await profilesApi.json()) as { profiles?: unknown };
    expect(payload.profiles).toEqual([]);

    await page.getByLabel('Name').fill('Sparse browser person');
    await page.getByRole('button', { name: /create personal map/i }).click();
    await expect(page).toHaveURL(/\/astrologer\/p\/[0-9a-f-]+\/profile\/life-map$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /your life map starts/i })).toBeVisible();
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: /open navigation/i }).click();
      await expect(page.locator('aside:visible').getByText('Private · Personal only')).toBeVisible();
      await page.getByRole('button', { name: /close navigation/i }).last().click();
    } else {
      await expect(page.getByText('Private · Personal only')).toBeVisible();
    }

    await page.screenshot({
      path: testInfo.outputPath(`astrologer-${testInfo.project.name}-initial.png`),
      fullPage: true,
    });
    await page.reload();
    await expect(page).toHaveURL(/\/astrologer\/p\/[0-9a-f-]+\/profile\/life-map$/);
    await expect(page.getByRole('heading', { name: /your life map starts/i })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`astrologer-${testInfo.project.name}-reloaded.png`),
      fullPage: true,
    });
  } finally {
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw new Error(`Could not delete disposable local auth user: ${deleted.error.message}`);
    }
  }
});
