import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('synthetic local conversation persists an answer across reload', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('P1 provider E2E refuses non-local Supabase');
  }
  if (!process.env.OPENCODE_API_KEY && !process.env.OPENGO_API && !process.env.OPENROUTER_API_KEY) {
    throw new Error('P1 provider E2E needs a configured provider in the local environment');
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p1-e2e-${crypto.randomUUID()}@example.invalid`;
  const password = `P1-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('local user creation failed');
  const userId = created.data.user.id;

  try {
    const profile = await admin.from('astro_profiles').insert({
      user_id: userId, name: 'Synthetic sparse person', birth_date: '1990-01-01', birth_time: '06:30',
      lat: 12.9716, lng: 77.5946, tz: 'Asia/Kolkata', place_name: 'Bengaluru',
      chart_json: {}, sensitivity_json: {}, initialization_status: 'ready',
    }).select('id').single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('profile missing');
    const session = await admin.from('astro_sessions').insert({
      user_id: userId, profile_id: profile.data.id, title: 'Synthetic sparse conversation', status: 'complete',
    }).select('id').single();
    if (session.error || !session.data) throw session.error ?? new Error('session missing');

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await page.goto('/astrologer');
    await expect(page.getByText('Synthetic sparse conversation')).toBeVisible();
    const composer = page.getByPlaceholder('Ask your astrologer…');
    await expect(composer).toBeEnabled();

    const sent = page.waitForResponse((response) => response.url().endsWith('/api/astrologer/chat') && response.request().method() === 'POST');
    await composer.fill('I have not shared my current goals. What do you actually know, and what one question would help?');
    await composer.press('Enter');
    const started = await sent;
    expect(started.status()).toBe(202);
    const payload = (await started.json()) as { runId: string; messageId: string };
    expect(payload.runId).toMatch(/^[0-9a-f-]{36}$/i);

    await expect.poll(async () => {
      const result = await admin.from('astro_agent_runs')
        .select('status,step_count,error_code,output_message_id')
        .eq('id', payload.runId).single();
      if (result.error || !result.data) throw result.error ?? new Error('run missing');
      return result.data.status;
    }, { timeout: 180_000, intervals: [1000, 2000, 3000] }).toMatch(/^(waiting_for_user|complete|failed)$/);
    const state = await admin.from('astro_agent_runs')
      .select('status,step_count,error_code,output_message_id').eq('id', payload.runId).single();
    if (state.error || !state.data) throw state.error ?? new Error('run missing');
    expect(state.data.status, `run failed after ${state.data.step_count} steps; code=${state.data.error_code}`).not.toBe('failed');
    expect(state.data.output_message_id).toBeTruthy();
    const message = await admin.from('astro_messages').select('content').eq('id', state.data.output_message_id).single();
    if (message.error || !message.data) throw message.error ?? new Error('answer missing');
    expect(message.data.content.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText(message.data.content, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath('synthetic-conversation-reloaded.png'), fullPage: true });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});
