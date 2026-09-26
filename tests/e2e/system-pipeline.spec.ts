import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

const realProvider = process.env.P3_REAL_PROVIDER_E2E === '1';
const pipelineTest = realProvider ? test : test.skip;

type RunResult = {
  status: string;
  output_message_id: string | null;
  error_code: string | null;
  plan_json?: { steps?: Array<{ kind?: string; calculation?: { tool?: string; args?: unknown } }> };
};

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
  if (await page.getByRole('button', { name: /open navigation/i }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /open navigation/i }).click();
  }
  await page.getByRole('button', { name: /login/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 15_000 });
}

async function startTrace(page: Page, testInfo: TestInfo) {
  await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true, title: 'system-pipeline-after-auth' });
  testInfo.annotations.push({ type: 'trace-scope', description: 'Tracing began after visible sign-in completed; credential entry is excluded.' });
}

async function saveTrace(page: Page, testInfo: TestInfo) {
  const tracePath = testInfo.outputPath('system-pipeline-trace.zip');
  try {
    await page.context().tracing.stop({ path: tracePath });
    await testInfo.attach('authenticated-system-pipeline-trace', { path: tracePath, contentType: 'application/zip' });
  } catch {
    // A failed launch can prevent tracing from starting. Preserve the original
    // product failure rather than hiding it with a secondary trace error.
  }
}

async function captureThreeWidths(page: Page, testInfo: TestInfo, state: string, visualIssues: string[]) {
  const viewports = [
    { name: 'desktop-1586x992', width: 1586, height: 992 },
    { name: 'laptop-1366x768', width: 1366, height: 768 },
    { name: 'mobile-390x844', width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflowing) visualIssues.push(`${state}: horizontal page overflow at ${viewport.width}x${viewport.height}`);
    await page.screenshot({
      path: testInfo.outputPath(`${state}-${viewport.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
}

async function captureFailureAtThreeWidths(page: Page, testInfo: TestInfo) {
  for (const viewport of [
    { name: 'desktop-1586x992', width: 1586, height: 992 },
    { name: 'laptop-1366x768', width: 1366, height: 768 },
    { name: 'mobile-390x844', width: 390, height: 844 },
  ]) {
    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.screenshot({ path: testInfo.outputPath(`failure-${viewport.name}.png`), fullPage: false, animations: 'disabled' });
    } catch {
      // Keep the causal test error if the browser closed before this capture.
    }
  }
}

async function waitForRun(admin: SupabaseClient, runId: string, timeout = 600_000): Promise<RunResult> {
  await expect.poll(async () => {
    const result = await admin.from('astro_agent_runs').select('status').eq('id', runId).single();
    if (result.error || !result.data) throw result.error ?? new Error(`Run ${runId} disappeared.`);
    return result.data.status;
  }, { timeout, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(waiting_for_user|complete|failed)$/);
  const result = await admin.from('astro_agent_runs')
    .select('status,output_message_id,error_code,plan_json').eq('id', runId).single();
  if (result.error || !result.data) throw result.error ?? new Error(`Run ${runId} has no terminal receipt.`);
  if (result.data.status === 'failed') {
    const steps = await admin.from('astro_agent_run_steps')
      .select('ordinal,kind,status,tool_name,output_summary,refs,cache_hit')
      .eq('run_id', runId).order('ordinal', { ascending: true });
    throw new Error(`Agent run failed (${result.data.error_code ?? 'unknown'}): ${JSON.stringify(steps.data ?? [])}`);
  }
  expect(result.data.output_message_id).toBeTruthy();
  return result.data as RunResult;
}

async function sendMessage(page: Page, admin: SupabaseClient, text: string) {
  const composer = page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]');
  await expect(composer).toBeEnabled({ timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/astrologer/chat') && response.request().method() === 'POST');
  await composer.fill(text);
  await composer.press('Enter');
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const payload = await response.json() as { runId: string; messageId: string };
  expect(payload.runId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(payload.messageId).toMatch(/^[0-9a-f-]{36}$/i);
  const userMessage = await admin.from('astro_messages').select('role,content').eq('id', payload.messageId).single();
  if (userMessage.error || !userMessage.data) throw userMessage.error ?? new Error('User message was not durably stored.');
  expect(userMessage.data).toMatchObject({ role: 'user', content: text });
  const run = await waitForRun(admin, payload.runId);
  const answer = await admin.from('astro_messages').select('content').eq('id', run.output_message_id!).single();
  if (answer.error || !answer.data) throw answer.error ?? new Error('Assistant response was not durably stored.');
  expect(answer.data.content.trim().length).toBeGreaterThan(0);
  await expect(page.getByText(answer.data.content, { exact: true })).toBeVisible({ timeout: 30_000 });
  return { runId: payload.runId, messageId: payload.messageId, answer: answer.data.content };
}

async function createVisibleConversation(page: Page, personId: string, admin: SupabaseClient, userId: string) {
  const createButton = page.getByRole('button', { name: /new conversation/i });
  if (!(await createButton.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /open navigation/i }).click();
  }
  const createResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/astrologer/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /new conversation/i }).click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const body = await response.json() as { sessionId?: string; profileId?: string };
  expect(body.profileId).toBe(personId);
  expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  const sessionId = body.sessionId!;
  await expect(page).toHaveURL(`/astrologer/p/${personId}/chat/${sessionId}`, { timeout: 30_000 });
  const closeNavigation = page.getByRole('button', { name: /close navigation/i });
  if (await closeNavigation.isVisible().catch(() => false)) await closeNavigation.click();
  const after = await admin.from('astro_sessions').select('id').eq('id', sessionId).eq('profile_id', personId).eq('user_id', userId).single();
  if (after.error || !after.data) throw after.error ?? new Error('Visible New conversation did not create a session.');
  return sessionId;
}

async function waitForConsolidation(admin: SupabaseClient, userId: string, personId: string, sourceSeq: number) {
  await expect.poll(async () => {
    const result = await admin.from('person_jobs').select('state,attempt_count,available_at')
      .eq('profile_id', personId).eq('user_id', userId).eq('job_kind', 'source_consolidation')
      .lte('source_from_seq', sourceSeq).gte('source_to_seq', sourceSeq)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return result.data?.state ?? null;
  }, { timeout: 720_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(completed|failed)$/);
  const job = await admin.from('person_jobs').select('state,result_revision,last_error_code')
    .eq('profile_id', personId).eq('user_id', userId).eq('job_kind', 'source_consolidation')
    .lte('source_from_seq', sourceSeq).gte('source_to_seq', sourceSeq)
    .order('created_at', { ascending: false }).limit(1).single();
  if (job.error || !job.data) throw job.error ?? new Error('Consolidation receipt missing.');
  expect(job.data.state, `Consolidation failed (${job.data.last_error_code ?? 'unknown'}).`).toBe('completed');
  expect(job.data.result_revision).toBeGreaterThan(0);
  return job.data.result_revision as number;
}

async function waitForSourceConsolidation(admin: SupabaseClient, userId: string, personId: string, messageId: string) {
  const source = await expect.poll(async () => {
    const result = await admin.from('person_source_items')
      .select('id,source_seq,source_kind,speaker_role,subject_kind,inclusion_status')
      .eq('profile_id', personId).eq('user_id', userId).eq('source_message_id', messageId).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }, { timeout: 45_000, intervals: [500, 1_000, 2_000] }).toMatchObject({
    source_kind: 'native_message', speaker_role: 'user', subject_kind: 'self', inclusion_status: 'included',
  }).then(async () => {
    const result = await admin.from('person_source_items').select('id,source_seq')
      .eq('profile_id', personId).eq('user_id', userId).eq('source_message_id', messageId).single();
    if (result.error || !result.data) throw result.error ?? new Error('Source record missing.');
    return result.data;
  });
  const revision = await waitForConsolidation(admin, userId, personId, source.source_seq);
  return { source, revision };
}

async function cleanupUser(admin: SupabaseClient, userId: string) {
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error && deleted.error.code !== 'user_not_found') throw deleted.error;
}

pipelineTest('name-only onboarding to grounded memory, birth setup, chart, and live Atros dasha', async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const url = process.env.P3_STAGING_E2E === '1'
    ? process.env.P3_STAGING_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.P3_STAGING_E2E === '1'
    ? process.env.P3_STAGING_SUPABASE_SECRET_KEY
    : process.env.SUPABASE_SECRET_KEY;
  const publishable = process.env.P3_STAGING_E2E === '1'
    ? process.env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !publishable) throw new Error('System pipeline requires explicit disposable Supabase credentials.');
  const host = new URL(url).hostname;
  if (process.env.P3_STAGING_E2E === '1') {
    const expectedRef = process.env.P3_STAGING_SUPABASE_REF;
    if (expectedRef !== 'wtloawiwntyjiidjbmuk' || host !== `${expectedRef}.supabase.co`) {
      throw new Error('Hosted system pipeline refuses a Supabase target outside the approved staging project.');
    }
  } else if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Local system pipeline only permits loopback Supabase.');
  }
  if (process.env.P3_STAGING_E2E !== '1'
    && !process.env.OPENCODE_API_KEY && !process.env.OPENGO_API && !process.env.OPENROUTER_API_KEY) {
    throw new Error('The system pipeline needs an explicitly configured real agent provider.');
  }
  if (process.env.P3_STAGING_E2E === '1') {
    const stagingIp = process.env.P3_STAGING_SUPABASE_IP;
    if (!stagingIp || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(stagingIp)) {
      throw new Error('Hosted system pipeline requires an explicit staging Supabase DNS pin.');
    }
    setGlobalDispatcher(new Agent({
      connect: {
        lookup(hostname, options, callback) {
          if (hostname === `${process.env.P3_STAGING_SUPABASE_REF}.supabase.co`) {
            callback(null, [{ address: stagingIp, family: 4 }]);
            return;
          }
          systemLookup(hostname, options, callback);
        },
      },
    }));
  }

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `system-pipeline-${crypto.randomUUID()}@example.invalid`;
  const password = `Pipeline-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Disposable user creation failed.');
  const userId = created.data.user.id;
  const visualIssues: string[] = [];
  let failedPersonId: string | null = null;
  let failureStage = 'visible sign-in';
  let traceStarted = false;
  let primaryFailure: unknown;
  const browserErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  try {
    await signIn(page, email, password);
    await startTrace(page, testInfo);
    traceStarted = true;
    failureStage = 'name-only person creation';
    await page.goto('/astrologer');
    await expect(page.getByRole('heading', { name: 'Whose life are we understanding?' })).toBeVisible();
    await captureThreeWidths(page, testInfo, '01-name-only-onboarding', visualIssues);
    const createProfileResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/astrologer/profiles') && response.request().method() === 'POST');
    await page.getByLabel('Name').fill('Pipeline Synthetic Person');
    await page.getByRole('button', { name: /create personal map/i }).click();
    const profileResponse = await createProfileResponse;
    expect(profileResponse.status()).toBe(201);
    const profileBody = await profileResponse.json() as { profileId?: string };
    expect(profileBody.profileId).toMatch(/^[0-9a-f-]{36}$/i);
    const personId = profileBody.profileId!;
    failedPersonId = personId;
    await expect(page).toHaveURL(new RegExp(`/astrologer/p/${personId}/profile/life-map$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Your life map starts with what you choose to share.' })).toBeVisible();
    const profile = await admin.from('astro_profiles').select('id,name,birth_date,birth_time,chart_json,sensitivity_json,initialization_status')
      .eq('id', personId).eq('user_id', userId).single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('Name-only profile was not created.');
    expect(profile.data.name).toBe('Pipeline Synthetic Person');
    expect(profile.data.birth_date).toBeNull();
    expect(profile.data.birth_time).toBeNull();
    await captureThreeWidths(page, testInfo, '02-name-only-life-map', visualIssues);

    failureStage = 'personal chat answer and first memory publication';
    const firstSessionId = await createVisibleConversation(page, personId, admin, userId);
    await expect(page.getByPlaceholder('Tell me what you are exploring…')).toBeEnabled();
    const helpPattern = 'I notice a recurring thing: when I am stuck on a difficult project, I delay asking a friend for help and try to solve it alone. I have not worked out why I do that.';
    const firstAnswer = await sendMessage(page, admin, helpPattern);
    const firstSource = await waitForSourceConsolidation(admin, userId, personId, firstAnswer.messageId);
    const storedFirstResponse = await admin.from('astro_agent_runs').select('status,phase,error_code,output_message_id')
      .eq('id', firstAnswer.runId).single();
    if (storedFirstResponse.error || !storedFirstResponse.data) throw storedFirstResponse.error ?? new Error('Personal answer run receipt missing.');
    expect(storedFirstResponse.data.status).toMatch(/^(waiting_for_user|complete)$/);
    expect(storedFirstResponse.data.output_message_id).toBeTruthy();
    await page.reload();
    await expect(page.getByText(firstAnswer.answer, { exact: true })).toBeVisible({ timeout: 30_000 });
    await captureThreeWidths(page, testInfo, '03-personal-answer-reloaded', visualIssues);

    failureStage = 'counterexample chat and second memory publication';
    const secondSessionId = await createVisibleConversation(page, personId, admin, userId);
    expect(secondSessionId).not.toBe(firstSessionId);
    const counterexample = 'Last week I asked a friend for help on a task where I was stuck. They helped, it went fine, and we got unstuck. That is a useful counterexample to my usual delay.';
    const secondTurn = await sendMessage(page, admin, counterexample);
    const secondSource = await waitForSourceConsolidation(admin, userId, personId, secondTurn.messageId);
    expect(secondSource.revision).toBeGreaterThan(firstSource.revision);
    await page.goto(`/astrologer/p/${personId}/profile/life-map`);
    await expect(page.getByRole('link', { name: 'Life map' })).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
    await captureThreeWidths(page, testInfo, '04-memory-published', visualIssues);

    failureStage = 'fresh-chat memory recall';
    const thirdSessionId = await createVisibleConversation(page, personId, admin, userId);
    expect(thirdSessionId).not.toBe(firstSessionId);
    expect(thirdSessionId).not.toBe(secondSessionId);
    const recall = await sendMessage(page, admin, 'What have I said about asking for help, and what happened when I asked a friend last week?');
    expect(recall.answer).toMatch(/help/i);
    expect(recall.answer).toMatch(/friend|asked|last week/i);
    const plan = await admin.from('astro_agent_run_steps').select('refs').eq('run_id', recall.runId).eq('kind', 'plan')
      .order('ordinal', { ascending: true }).limit(1).single();
    if (plan.error || !plan.data) throw plan.error ?? new Error('Fresh-chat model revision receipt missing.');
    const planRefs = plan.data.refs as { personRevision?: number };
    expect(planRefs.personRevision).toBeGreaterThanOrEqual(secondSource.revision);
    await expect(page.getByText(recall.answer, { exact: true })).toBeVisible();
    await captureThreeWidths(page, testInfo, '05-fresh-chat-recall', visualIssues);

    failureStage = 'birth details, chart, and sensitivity setup';
    await page.goto(`/astrologer/p/${personId}/settings`);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const birthForm = page.getByTestId('birth-setup-form');
    await expect(birthForm).toBeVisible({ timeout: 30_000 });
    await captureThreeWidths(page, testInfo, '06-birth-setup-form', visualIssues);
    await page.getByLabel('Birth date').fill('1991-02-03');
    await page.getByLabel('Birth time (HH:MM)').fill('04:56');
    const place = page.getByLabel('Birth place');
    await place.fill('Bengaluru');
    const suggestion = page.getByRole('listbox', { name: 'Birth place results' }).getByRole('option', { name: /Bengaluru/i }).first();
    await expect(suggestion).toBeVisible({ timeout: 30_000 });
    await suggestion.click();
    await page.getByLabel('Time source').selectOption('hospital');
    await page.getByLabel('Time confidence').selectOption('exact');
    const birthStart = page.waitForResponse((response) =>
      response.url().endsWith(`/api/astrologer/profiles/${personId}/birth`) && response.request().method() === 'POST');
    await page.getByTestId('birth-submit').click();
    const started = await birthStart;
    expect(started.status()).toBe(202);
    const birthRun = await started.json() as { profileId?: string; sessionId?: string; runId?: string; status?: string };
    expect(birthRun.profileId).toBe(personId);
    expect(birthRun.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(birthRun.runId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.getByTestId('birth-status')).toContainText(/ready/i, { timeout: 600_000 });
    const birthReady = await admin.from('astro_profiles')
      .select('birth_date,birth_time,lat,lng,tz,place_name,chart_json,sensitivity_json,initialization_status')
      .eq('id', personId).eq('user_id', userId).single();
    if (birthReady.error || !birthReady.data) throw birthReady.error ?? new Error('Birth profile disappeared after setup.');
    expect(birthReady.data).toMatchObject({ birth_date: '1991-02-03', birth_time: '04:56', initialization_status: 'ready' });
    expect(birthReady.data.lat).toEqual(expect.any(Number));
    expect(birthReady.data.lng).toEqual(expect.any(Number));
    expect(birthReady.data.tz).toBeTruthy();
    expect(birthReady.data.place_name).toMatch(/Bengaluru/i);
    expect(birthReady.data.chart_json).toBeTruthy();
    expect(birthReady.data.sensitivity_json).toBeTruthy();
    expect(Object.keys(birthReady.data.chart_json as Record<string, unknown>).length).toBeGreaterThan(0);
    expect(Object.keys(birthReady.data.sensitivity_json as Record<string, unknown>).length).toBeGreaterThan(0);
    await captureThreeWidths(page, testInfo, '07-birth-chart-ready', visualIssues);

    failureStage = 'astrology-enabled current-dasha run';
    const astrologySwitch = page.getByRole('switch', { name: 'Astrology layer' });
    await expect(astrologySwitch).toHaveAttribute('aria-checked', 'false');
    // Saving this setting reloads the document. Wait for that real navigation
    // instead of racing it with a second page.goto to the same URL.
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
      astrologySwitch.click(),
    ]);
    await expect.poll(async () => {
      const preference = await admin.from('person_preferences').select('astrology_enabled')
        .eq('profile_id', personId).eq('user_id', userId).single();
      if (preference.error || !preference.data) throw preference.error ?? new Error('Astrology preference missing.');
      return preference.data.astrology_enabled;
    }, { timeout: 30_000 }).toBe(true);
    await expect(page.getByRole('switch', { name: 'Astrology layer' })).toHaveAttribute('aria-checked', 'true');
    await captureThreeWidths(page, testInfo, '08-astrology-enabled', visualIssues);

    const astroSessionId = await createVisibleConversation(page, personId, admin, userId);
    const dasha = await sendMessage(page, admin, 'What is my current dasha? Explain it as a reflective lens, not a deterministic prediction.');
    const dashaRun = await waitForRun(admin, dasha.runId);
    expect(dashaRun.plan_json?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'calculate', calculation: { tool: 'atros_current_dasha', args: {} } }),
    ]));
    const tool = await admin.from('astro_agent_run_steps').select('status,tool_name,refs,cache_hit')
      .eq('run_id', dasha.runId).eq('kind', 'tool').eq('tool_name', 'atros_current_dasha')
      .order('ordinal', { ascending: true }).limit(1).single();
    if (tool.error || !tool.data) throw tool.error ?? new Error('Current dasha tool receipt missing.');
    expect(tool.data.status).toBe('succeeded');
    expect(tool.data.cache_hit).toBe(false);
    expect(tool.data.refs).toMatchObject({ tool: 'atros_current_dasha', args: {} });
    expect(dasha.answer.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText(dasha.answer, { exact: true })).toBeVisible({ timeout: 30_000 });
    await captureThreeWidths(page, testInfo, '09-atros-current-dasha-answer', visualIssues);
    await testInfo.attach('responsive-visual-issues', { body: JSON.stringify(visualIssues, null, 2), contentType: 'application/json' });
    expect(visualIssues, 'Responsive page overflow was detected; screenshots and authenticated trace were preserved.').toEqual([]);
    expect(browserErrors).toEqual([]);
    testInfo.annotations.push({ type: 'pipeline-receipt', description: JSON.stringify({ personId, firstSessionId, secondSessionId, thirdSessionId, astroSessionId, personRevision: planRefs.personRevision, astrologyRunId: dasha.runId, tool: 'atros_current_dasha', memoryJobsObservedWithoutCronNudge: 2 }) });
  } catch (error) {
    primaryFailure = error;
    testInfo.annotations.push({ type: 'failed-stage', description: failureStage });
    await testInfo.attach('failed-fixture-reference', {
      body: JSON.stringify({ userId, personId: failedPersonId, failureStage }, null, 2),
      contentType: 'application/json',
    });
    await captureFailureAtThreeWidths(page, testInfo);
    throw error;
  } finally {
    if (traceStarted) await saveTrace(page, testInfo);
    await page.context().clearCookies();
    try {
      const preserveLocalFailedFixture = primaryFailure && process.env.P3_KEEP_FAILED_FIXTURE === '1'
        && process.env.P3_STAGING_E2E !== '1';
      if (preserveLocalFailedFixture) {
        testInfo.annotations.push({ type: 'cleanup', description: 'Local disposable user intentionally retained for failure diagnosis.' });
      } else {
        await cleanupUser(admin, userId);
      }
    } catch (cleanupError) {
      if (!primaryFailure) throw cleanupError;
    }
  }
});
