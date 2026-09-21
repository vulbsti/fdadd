import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('failed provider run has a clear responsive recovery state', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('P1 recovery visual E2E refuses non-local Supabase');
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p1-recovery-visual-${crypto.randomUUID()}@example.invalid`;
  const password = `P1-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('local user creation failed');
  const userId = created.data.user.id;

  try {
    const profile = await admin.from('astro_profiles').insert({
      user_id: userId,
      name: 'Recovery visual person',
      birth_date: '1990-01-01',
      birth_time: '06:30',
      lat: 12.9716,
      lng: 77.5946,
      tz: 'Asia/Kolkata',
      place_name: 'Bengaluru',
      chart_json: {},
      sensitivity_json: {},
      initialization_status: 'ready',
    }).select('id').single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('profile missing');
    const session = await admin.from('astro_sessions').insert({
      user_id: userId,
      profile_id: profile.data.id,
      title: 'Recovery visual proof',
      status: 'failed',
      next_action: 'Resume this request when you are ready.',
    }).select('id').single();
    if (session.error || !session.data) throw session.error ?? new Error('session missing');
    const message = await admin.from('astro_messages').insert({
      user_id: userId,
      session_id: session.data.id,
      role: 'user',
      content: 'Preserve this request while the provider recovers.',
      client_message_id: crypto.randomUUID(),
    }).select('id').single();
    if (message.error || !message.data) throw message.error ?? new Error('message missing');
    const run = await admin.from('astro_agent_runs').insert({
      user_id: userId,
      profile_id: profile.data.id,
      session_id: session.data.id,
      kind: 'question',
      status: 'failed',
      client_request_id: crypto.randomUUID(),
      triggering_message_id: message.data.id,
      resumable: true,
      error_code: 'internal',
      error_message: 'The astrologer model could not complete this run.',
      next_action: 'Resume this request when you are ready.',
      completed_at: new Date().toISOString(),
    }).select('id').single();
    if (run.error || !run.data) throw run.error ?? new Error('run missing');
    const linked = await admin.from('astro_sessions').update({ last_run_id: run.data.id })
      .eq('id', session.data.id);
    if (linked.error) throw linked.error;

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: /toggle menu/i }).click();
    }
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await page.goto('/astrologer');

    // AstrologerChat performs its own detail fetch after the shell has selected
    // the session. Waiting for persisted content avoids asserting against the
    // short-lived chat skeleton while that second request is still in flight.
    await expect(page.getByText('Preserve this request while the provider recovers.', { exact: true }))
      .toBeVisible({ timeout: 45_000 });

    const alert = page.getByRole('alert').filter({ hasText: 'The last run failed.' });
    await expect(alert).toContainText('The last run failed. Resume this request when you are ready.', {
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
    await expect(page.getByPlaceholder('Ask your astrologer…')).toBeDisabled();
    await expect(page.getByText('RESPONDING', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`recovery-${testInfo.project.name}.png`),
      fullPage: true,
    });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});
