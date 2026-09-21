import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const PROXY_PORT = 19_082;
const PROXY_BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;
const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

async function readRequestBody(request: import('node:http').IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('provider failure is resumable after EventSource reconnect without changing the request', async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  test.skip(
    process.env.P1_PROVIDER_RECOVERY_PROXY !== '1',
    'Run through test:e2e:provider-recovery:local so the fault proxy is isolated from normal E2E.',
  );
  expect(process.env.OPENGO_BASE_URL).toBe(PROXY_BASE_URL);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('P1 recovery E2E refuses non-local Supabase');
  }
  if (!process.env.OPENCODE_API_KEY && !process.env.OPENGO_API) {
    throw new Error('P1 recovery E2E needs a valid OpenCode Go key in the local environment');
  }

  let injectedFailures = 0;
  let forwardedRequests = 0;
  let blockProvider = true;
  const providerBodies: string[] = [];
  const proxy = createServer(async (request, response) => {
    try {
      const body = await readRequestBody(request);
      providerBodies.push(body.toString('utf8'));
      if (blockProvider) {
        injectedFailures += 1;
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'synthetic provider outage' } }));
        return;
      }

      forwardedRequests += 1;
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (!value || ['host', 'connection', 'content-length', 'transfer-encoding'].includes(name)) continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const upstream = await fetch(`${OPENCODE_GO_BASE_URL}${request.url ?? '/responses'}`, {
        method: request.method,
        headers,
        body: body.length ? body : undefined,
      });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'local provider proxy failed' } }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(PROXY_PORT, '127.0.0.1', resolve);
  });

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p1-recovery-${crypto.randomUUID()}@example.invalid`;
  const password = `P1-${crypto.randomUUID()}-Aa1!`;
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error('local user creation failed');
    userId = created.data.user.id;
    const profile = await admin.from('astro_profiles').insert({
      user_id: userId,
      name: 'Recovery proof person',
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
      title: 'Provider recovery proof',
      status: 'complete',
    }).select('id').single();
    if (session.error || !session.data) throw session.error ?? new Error('session missing');

    const eventRequests: Array<{ lastEventId: string | null; url: string }> = [];
    await page.route('**/api/astrologer/runs/*/events*', async (route) => {
      const headers = await route.request().allHeaders();
      eventRequests.push({
        lastEventId: headers['last-event-id'] ?? null,
        url: route.request().url(),
      });
      if (eventRequests.length === 1) {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
          },
          body: `retry: 50\nid: 7\nevent: phase.changed\ndata: ${JSON.stringify({
            event: 'phase.changed',
            runId: '00000000-0000-4000-8000-000000000000',
            phase: 'planning',
            status: 'active',
          })}\n\n`,
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await page.goto('/astrologer');
    await expect(page.getByText('Provider recovery proof')).toBeVisible();

    const composer = page.getByPlaceholder('Ask your astrologer…');
    const originalRequest = 'Keep this exact question across a provider failure: what do you know about my current priorities?';
    const sent = page.waitForResponse((candidate) =>
      candidate.url().endsWith('/api/astrologer/chat') && candidate.request().method() === 'POST');
    await composer.fill(originalRequest);
    await composer.press('Enter');
    const started = await sent;
    expect(started.status()).toBe(202);
    const firstPayload = (await started.json()) as { runId: string; messageId: string };

    await expect.poll(async () => {
      const result = await admin.from('astro_agent_runs')
        .select('status').eq('id', firstPayload.runId).single();
      if (result.error || !result.data) throw result.error ?? new Error('failed run missing');
      return result.data.status;
    }, { timeout: 240_000, intervals: [500, 1000, 2000, 5000] }).toBe('failed');

    const failed = await admin.from('astro_agent_runs')
      .select('status,phase,resumable,error_code,error_message,next_action,triggering_message_id')
      .eq('id', firstPayload.runId).single();
    if (failed.error || !failed.data) throw failed.error ?? new Error('failed run missing');
    expect(failed.data).toMatchObject({
      status: 'failed',
      phase: null,
      resumable: true,
      error_code: 'internal',
      triggering_message_id: firstPayload.messageId,
    });
    expect(failed.data.error_message).toContain('model could not complete');
    expect(failed.data.error_message).not.toContain('synthetic provider outage');
    expect(injectedFailures).toBeGreaterThan(0);
    const providerBodiesAtFailure = providerBodies.length;
    blockProvider = false;

    await expect.poll(() => eventRequests.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/The last run failed\./)).toBeVisible({ timeout: 20_000 });
    const resumeButton = page.getByRole('button', { name: 'Resume' });
    await expect(resumeButton).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('provider-failure-resumable.png'), fullPage: true });

    const resumedResponse = page.waitForResponse((candidate) =>
      candidate.url().includes(`/api/astrologer/runs/${firstPayload.runId}/resume`) &&
      candidate.request().method() === 'POST');
    await resumeButton.click();
    const resumedStarted = await resumedResponse;
    expect(resumedStarted.status()).toBe(202);
    const resumedPayload = (await resumedStarted.json()) as { runId: string };
    await expect(resumeButton).toBeDisabled();

    await expect.poll(async () => {
      const result = await admin.from('astro_agent_runs')
        .select('status').eq('id', resumedPayload.runId).single();
      if (result.error || !result.data) throw result.error ?? new Error('resumed run missing');
      return result.data.status;
    }, { timeout: 300_000, intervals: [1000, 2000, 3000] })
      .toMatch(/^(waiting_for_user|complete|failed)$/);

    const resumed = await admin.from('astro_agent_runs')
      .select('status,phase,resume_from_run_id,triggering_message_id,output_message_id,error_code')
      .eq('id', resumedPayload.runId).single();
    if (resumed.error || !resumed.data) throw resumed.error ?? new Error('resumed run missing');
    if (resumed.data.status === 'failed') {
      const [steps, dispatch] = await Promise.all([
        admin.from('astro_agent_run_steps')
          .select('ordinal,step_key,kind,status,tool_name,input_summary,output_summary,refs')
          .eq('run_id', resumedPayload.runId).order('ordinal', { ascending: true }),
        admin.from('astro_run_dispatches')
          .select('state,attempt_count,workflow_run_id,last_error')
          .eq('run_id', resumedPayload.runId).maybeSingle(),
      ]);
      await testInfo.attach(`durable-resume-failure-${resumedPayload.runId}`, {
        body: JSON.stringify({ run: resumed.data, steps: steps.data, dispatch: dispatch.data }, null, 2),
        contentType: 'application/json',
      });
    }
    expect(resumed.data.status, `resumed run failed with ${resumed.data.error_code}`).not.toBe('failed');
    expect(resumed.data.phase).toBeNull();
    expect(resumed.data.resume_from_run_id).toBe(firstPayload.runId);
    expect(resumed.data.triggering_message_id).toBe(firstPayload.messageId);
    expect(resumed.data.output_message_id).toBeTruthy();
    expect(forwardedRequests).toBeGreaterThan(0);
    expect(providerBodies.slice(providerBodiesAtFailure).some((body) => body.includes(originalRequest))).toBe(true);

    const dispatch = await admin.from('astro_run_dispatches')
      .select('state,attempt_count,workflow_run_id').eq('run_id', resumedPayload.runId).single();
    if (dispatch.error || !dispatch.data) throw dispatch.error ?? new Error('resume dispatch missing');
    expect(dispatch.data).toMatchObject({ state: 'dispatched', attempt_count: 1 });
    expect(dispatch.data.workflow_run_id).toBeTruthy();

    const answer = await admin.from('astro_messages')
      .select('content').eq('id', resumed.data.output_message_id).single();
    if (answer.error || !answer.data) throw answer.error ?? new Error('resumed answer missing');
    await page.reload();
    await expect(page.getByText(originalRequest, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(answer.data.content, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/The last run failed\./)).toHaveCount(0);
    await expect(page.getByText('RESPONDING', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('provider-recovery-reloaded.png'), fullPage: true });
  } finally {
    const deleted = userId ? await admin.auth.admin.deleteUser(userId) : null;
    proxy.closeAllConnections();
    await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    if (deleted?.error) throw deleted.error;
  }
});
