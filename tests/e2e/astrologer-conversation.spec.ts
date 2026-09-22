import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('synthetic local conversation persists an answer across reload', async ({ page }, testInfo) => {
  test.setTimeout(480_000);
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

  const waitForSuccessfulRun = async (runId: string) => {
    await expect.poll(async () => {
      const result = await admin.from('astro_agent_runs')
        .select('status,step_count,error_code,output_message_id')
        .eq('id', runId).single();
      if (result.error || !result.data) throw result.error ?? new Error('run missing');
      return result.data.status;
    }, { timeout: 180_000, intervals: [1000, 2000, 3000] }).toMatch(/^(waiting_for_user|complete|failed)$/);
    const state = await admin.from('astro_agent_runs')
      .select('status,phase,step_count,error_code,output_message_id,resume_from_run_id')
      .eq('id', runId).single();
    if (state.error || !state.data) throw state.error ?? new Error('run missing');
    if (state.data.status === 'failed') {
      const [steps, dispatch] = await Promise.all([
        admin.from('astro_agent_run_steps')
          .select('ordinal,step_key,kind,status,tool_name,input_summary,output_summary,refs')
          .eq('run_id', runId)
          .order('ordinal', { ascending: true }),
        admin.from('astro_run_dispatches')
          .select('state,attempt_count,workflow_run_id,last_error')
          .eq('run_id', runId)
          .maybeSingle(),
      ]);
      await testInfo.attach(`durable-failure-receipt-${runId}`, {
        body: JSON.stringify({ state: state.data, steps: steps.data, dispatch: dispatch.data }, null, 2),
        contentType: 'application/json',
      });
    }
    expect(state.data.status, `run failed after ${state.data.step_count} steps; code=${state.data.error_code}`).not.toBe('failed');
    expect(state.data.phase).toBeNull();
    const dispatch = await admin.from('astro_run_dispatches')
      .select('state,attempt_count,workflow_run_id').eq('run_id', runId).single();
    if (dispatch.error || !dispatch.data) throw dispatch.error ?? new Error('dispatch missing');
    expect(dispatch.data.state).toBe('dispatched');
    expect(dispatch.data.attempt_count).toBe(1);
    expect(dispatch.data.workflow_run_id).toBeTruthy();
    return state.data;
  };

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

    const state = await waitForSuccessfulRun(payload.runId);
    expect(state.status).toBe('waiting_for_user');
    expect(state.output_message_id).toBeTruthy();
    const message = await admin.from('astro_messages').select('content').eq('id', state.output_message_id).single();
    if (message.error || !message.data) throw message.error ?? new Error('answer missing');
    expect(message.data.content.length).toBeGreaterThan(0);
    const waitingSession = await admin.from('astro_sessions')
      .select('current_question').eq('id', session.data.id).single();
    if (waitingSession.error || !waitingSession.data?.current_question) {
      throw waitingSession.error ?? new Error('focused question missing');
    }
    const question = waitingSession.data.current_question as { id: string; prompt: string };
    expect(question.id).toMatch(/^[0-9a-f-]{36}$/i);

    await page.reload();
    await expect(page.getByText(message.data.content, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(question.prompt, { exact: true })).toBeVisible();
    await expect(page.getByText('RESPONDING', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('synthetic-conversation-reloaded.png'), fullPage: true });

    const followUpResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/astrologer/chat') && response.request().method() === 'POST');
    await composer.fill('My current focus is building a durable product and sharing the work consistently.');
    await composer.press('Enter');
    const followUpStarted = await followUpResponse;
    expect(followUpStarted.status()).toBe(202);
    expect(followUpStarted.request().postDataJSON()).toMatchObject({ answerToQuestionId: question.id });
    const followUpPayload = (await followUpStarted.json()) as { runId: string };
    const followUpState = await waitForSuccessfulRun(followUpPayload.runId);
    expect(followUpState.resume_from_run_id).toBe(payload.runId);
    expect(followUpState.output_message_id).toBeTruthy();
    const followUpMessage = await admin.from('astro_messages')
      .select('content').eq('id', followUpState.output_message_id).single();
    if (followUpMessage.error || !followUpMessage.data) {
      throw followUpMessage.error ?? new Error('follow-up answer missing');
    }
    await page.reload();
    await expect(page.getByText(followUpMessage.data.content, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('RESPONDING', { exact: true })).toHaveCount(0);

    // Open a second chat on the same person model through the visible UI.
    await page.getByRole('button', { name: /new reading/i }).click();
    await expect(page.getByText('Who is this reading for?')).toBeVisible();
    await page.getByRole('button', { name: /Synthetic sparse person.*Continue with this person's map/i }).click();
    await expect.poll(async () => {
      const rows = await admin.from('astro_sessions').select('id').eq('profile_id', profile.data.id);
      if (rows.error) throw rows.error;
      return rows.data.length;
    }).toBe(2);
    await expect(page.getByPlaceholder('Ask your astrologer…')).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('synthetic-second-chat.png'), fullPage: true });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});
