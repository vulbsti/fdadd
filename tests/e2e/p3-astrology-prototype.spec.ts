import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const liveIt = process.env.P3_ASTROLOGY_E2E === '1' ? test : test.skip;

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
  await page.getByRole('button', { name: /login/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });
}

async function waitForRun(admin: SupabaseClient, runId: string) {
  await expect.poll(async () => {
    const result = await admin.from('astro_agent_runs').select('status').eq('id', runId).single();
    if (result.error || !result.data) throw result.error ?? new Error('run missing');
    return result.data.status;
  }, { timeout: 600_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(waiting_for_user|complete|failed)$/);
  const result = await admin.from('astro_agent_runs')
    .select('status,phase,error_code,output_message_id,plan_json').eq('id', runId).single();
  if (result.error || !result.data) throw result.error ?? new Error('terminal run missing');
  if (result.data.status === 'failed') {
    const steps = await admin.from('astro_agent_run_steps')
      .select('ordinal,kind,status,tool_name,output_summary,refs,cache_hit')
      .eq('run_id', runId).order('ordinal', { ascending: true });
    throw new Error(`astrology run failed (${result.data.error_code ?? 'unknown'}): ${JSON.stringify(steps.data ?? [])}`);
  }
  expect(result.data.phase).toBeNull();
  return result.data;
}

liveIt('Luna plans and completes a cold current-dasha run through real Atros', async ({ page }, testInfo) => {
  test.setTimeout(720_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !publishable || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('Astrology prototype E2E requires explicit loopback Supabase configuration.');
  }
  if (!process.env.OPENCODE_API_KEY && !process.env.OPENGO_API) {
    throw new Error('Astrology prototype E2E requires the configured OpenCode Go credential.');
  }

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p3-astro-${crypto.randomUUID()}@example.invalid`;
  const password = `P3-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('disposable user creation failed');
  const userId = created.data.user.id;

  try {
    const profile = await admin.from('astro_profiles').insert({
      user_id: userId,
      name: 'P3 Astrology Synthetic',
      birth_date: '1991-02-03',
      birth_time: '04:56',
      lat: 12.9716,
      lng: 77.5946,
      tz: 'Asia/Kolkata',
      place_name: 'Bengaluru',
      chart_json: {},
      sensitivity_json: {},
      initialization_status: 'ready',
    }).select('id').single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('birth-ready profile missing');

    const userClient = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
    const signed = await userClient.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const session = await userClient.rpc('create_astro_session', { p_profile_id: profile.data.id });
    if (session.error) throw session.error;
    const sessionId = (session.data as { sessionId?: string }).sessionId;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    await signIn(page, email, password);
    await page.goto(`/astrologer/p/${profile.data.id}/settings`);
    const astrologySwitch = page.getByRole('switch', { name: 'Astrology layer' });
    await expect(astrologySwitch).toHaveAttribute('aria-checked', 'false');
    await astrologySwitch.click();
    await expect.poll(async () => {
      const result = await admin.from('person_preferences')
        .select('astrology_enabled,mode_epoch').eq('profile_id', profile.data.id).eq('user_id', userId).single();
      if (result.error || !result.data) throw result.error ?? new Error('person preference missing');
      return result.data.astrology_enabled ? result.data.mode_epoch : 0;
    }, { timeout: 30_000 }).toBeGreaterThan(0);

    await page.goto(`/astrologer/p/${profile.data.id}/chat/${sessionId}`);
    const composer = page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]');
    await expect(composer).toBeEnabled({ timeout: 30_000 });
    const accepted = page.waitForResponse((response) =>
      response.url().endsWith('/api/astrologer/chat') && response.request().method() === 'POST');
    await composer.fill('What is my current dasha? Explain it as a reflective lens, not a deterministic prediction.');
    await composer.press('Enter');
    const response = await accepted;
    expect(response.status()).toBe(202);
    const payload = await response.json() as { runId?: string };
    expect(payload.runId).toMatch(/^[0-9a-f-]{36}$/i);

    const run = await waitForRun(admin, payload.runId!);
    const plan = run.plan_json as { steps?: Array<{ kind?: string; calculation?: { tool?: string; args?: unknown } }> };
    expect(plan.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'calculate',
        calculation: { tool: 'atros_current_dasha', args: {} },
      }),
    ]));
    const toolStep = await admin.from('astro_agent_run_steps')
      .select('status,tool_name,refs,cache_hit')
      .eq('run_id', payload.runId!).eq('kind', 'tool').eq('tool_name', 'atros_current_dasha')
      .order('ordinal', { ascending: true }).limit(1).single();
    if (toolStep.error || !toolStep.data) throw toolStep.error ?? new Error('Atros current-dasha receipt missing');
    expect(toolStep.data.status).toBe('succeeded');
    expect(toolStep.data.cache_hit).toBe(false);
    expect(toolStep.data.refs).toMatchObject({ tool: 'atros_current_dasha', args: {} });

    const answer = await admin.from('astro_messages').select('content').eq('id', run.output_message_id).single();
    if (answer.error || !answer.data) throw answer.error ?? new Error('astrology answer missing');
    expect(answer.data.content.length).toBeGreaterThan(0);
    expect(answer.data.content).not.toMatch(/\*\*|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    await expect(page.getByText(answer.data.content, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('p3-astrology-current-dasha.png'), fullPage: false });
  } finally {
    await page.context().clearCookies();
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error && deleted.error.code !== 'user_not_found') throw deleted.error;
  }
});
