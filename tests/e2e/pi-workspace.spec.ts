import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { createHash, randomUUID } from 'node:crypto';
import { Agent, setGlobalDispatcher } from 'undici';
import type { PiCheckpoint } from '../../src/lib/astro/pi-store';

const stagingRef = 'wtloawiwntyjiidjbmuk';
const composerSelector = 'input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]';
type Scope = { userId: string; personId: string };
type Receipt = { step_key: string; status: string; tool_name: string | null; refs: Record<string, unknown> };

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await expect(page.locator('header .animate-pulse')).toBeHidden();
  await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/);
  const navigation = page.getByRole('button', { name: /open navigation/i });
  if (await navigation.isVisible().catch(() => false)) await navigation.click();
  await page.getByRole('button', { name: /login/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
}

async function screenshots(page: Page, info: TestInfo, state: string, issues: string[]) {
  for (const viewport of [{ name: 'desktop', width: 1586, height: 992 },
    { name: 'laptop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      issues.push(`${state}: horizontal overflow at ${viewport.width}x${viewport.height}`);
    }
    const file = info.outputPath(`${state}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
    await info.attach(`${state}-${viewport.name}`, { path: file, contentType: 'image/png' });
    // A viewport capture can legitimately show only the start of a long answer.
    // Prove its final lines are reachable in the independent transcript scroller
    // and are not covered by the composer, then persist that state separately.
    const lastMessage = page.locator('[id^="message-"]').last();
    if (viewport.name === 'mobile' && await lastMessage.count()) {
      const scroll = page.locator('[data-radix-scroll-area-viewport]').filter({ has: lastMessage });
      if (await scroll.count()) {
        await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        await expect.poll(async () => {
          const [messageBox, scrollBox, composerBox] = await Promise.all([
            lastMessage.boundingBox(), scroll.boundingBox(), page.locator(composerSelector).boundingBox(),
          ]);
          return Boolean(messageBox && scrollBox && composerBox
            && messageBox.y + messageBox.height <= scrollBox.y + scrollBox.height + 2
            && messageBox.y + messageBox.height <= composerBox.y);
        }).toBe(true);
        const bottom = info.outputPath(`${state}-mobile-scrolled-bottom.png`);
        await page.screenshot({ path: bottom, fullPage: false, animations: 'disabled' });
        await info.attach(`${state}-mobile-scrolled-bottom`, { path: bottom, contentType: 'image/png' });
      }
    }
  }
  await page.setViewportSize({ width: 1586, height: 992 });
}

async function newConversation(page: Page, admin: SupabaseClient, scope: Scope) {
  const button = page.getByRole('button', { name: /new conversation/i });
  if (!(await button.isVisible().catch(() => false))) await page.getByRole('button', { name: /open navigation/i }).click();
  const waiting = page.waitForResponse((r) => r.url().endsWith('/api/astrologer/sessions') && r.request().method() === 'POST');
  await button.click();
  const response = await waiting;
  expect(response.status()).toBe(201);
  const body = await response.json() as { sessionId: string; profileId: string };
  expect(body.profileId).toBe(scope.personId);
  await expect(page).toHaveURL(`/astrologer/p/${scope.personId}/chat/${body.sessionId}`);
  const close = page.getByRole('button', { name: /close navigation/i });
  if (await close.isVisible().catch(() => false)) await close.click();
  const row = await admin.from('astro_sessions').select('id').eq('id', body.sessionId)
    .eq('user_id', scope.userId).eq('profile_id', scope.personId).single();
  if (row.error || !row.data) throw new Error('Visible conversation has no owner-scoped session.');
  return body.sessionId;
}

async function send(page: Page, admin: SupabaseClient, scope: Scope, text: string, info: TestInfo,
  visualIssues: string[], proveOptimistic = false) {
  const composer = page.locator(composerSelector);
  await expect(composer).toBeEnabled();
  let release: () => void = () => {};
  let requestHeld = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const heldRoute = async (route: import('@playwright/test').Route) => {
    if (route.request().method() === 'POST' && !requestHeld) {
      requestHeld = true;
      await gate;
    }
    await route.continue();
  };
  if (proveOptimistic) await page.route('**/api/astrologer/chat', heldRoute);
  const waiting = page.waitForResponse((r) => r.url().endsWith('/api/astrologer/chat') && r.request().method() === 'POST');
  try {
    await composer.fill(text);
    await composer.press('Enter');
    if (proveOptimistic) {
      await expect.poll(() => requestHeld).toBe(true);
      const bubble = page.locator('[id^="message-"].justify-end').filter({ hasText: text });
      await expect(bubble).toHaveCount(1);
      await expect(bubble).toBeVisible();
      await expect(bubble).toContainText('Sending…');
      await screenshots(page, info, '03-optimistic-before-post', visualIssues);
      release();
    }
    const response = await waiting;
    expect(response.status()).toBe(202);
    const body = await response.json() as { runId: string; messageId: string };
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.messageId).toMatch(/^[0-9a-f-]{36}$/i);
    const input = await admin.from('astro_messages').select('role,content').eq('id', body.messageId)
      .eq('user_id', scope.userId).single();
    if (input.error || !input.data) throw new Error('Accepted user message was not durably stored.');
    expect(input.data).toMatchObject({ role: 'user', content: text });
    await expect.poll(async () => {
      const run = await admin.from('astro_agent_runs').select('status').eq('id', body.runId)
        .eq('user_id', scope.userId).eq('profile_id', scope.personId).single();
      if (run.error || !run.data) throw new Error('Owner-scoped Pi run disappeared.');
      return run.data.status;
    }, { timeout: 1_000_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(complete|failed)$/);
    const run = await admin.from('astro_agent_runs').select('status,output_message_id,error_code,error_message')
      .eq('id', body.runId).eq('user_id', scope.userId).eq('profile_id', scope.personId).single();
    if (run.error || !run.data) throw new Error('Terminal Pi run is unavailable.');
    const receipts = await admin.from('astro_agent_run_steps').select('step_key,status,tool_name,refs')
      .eq('run_id', body.runId).eq('user_id', scope.userId).eq('profile_id', scope.personId).order('ordinal');
    if (receipts.error) throw new Error('Pi tool receipts are unavailable.');
    const steps = (receipts.data ?? []) as Receipt[];
    await info.attach(`run-${body.runId}-receipts`, { body: JSON.stringify({ run: run.data, steps }, null, 2), contentType: 'application/json' });
    expect(run.data.status, `Pi run failed: ${run.data.error_code ?? ''} ${run.data.error_message ?? ''}`).toBe('complete');
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ step_key: 'pi:final', status: 'succeeded', refs: expect.objectContaining({ runtime: 'pi' }) })]));
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'succeeded', tool_name: 'workspace_read' })]));
    const answer = await admin.from('astro_messages').select('content,role').eq('id', run.data.output_message_id)
      .eq('user_id', scope.userId).eq('run_id', body.runId).single();
    if (answer.error || !answer.data) throw new Error('Completed Pi run has no persisted answer.');
    expect(answer.data.role).toBe('assistant');
    expect(answer.data.content.trim()).not.toBe('');
    await expect(page.getByText(answer.data.content, { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[id^="message-"].justify-end').filter({ hasText: text })).toHaveCount(1);
    return { ...body, answer: answer.data.content as string, steps };
  } finally {
    release();
    if (proveOptimistic) await page.unroute('**/api/astrologer/chat', heldRoute);
  }
}

async function checkpoint(admin: SupabaseClient, scope: Scope, runId: string) {
  const receipt = await admin.from('pi_workspace_checkpoints').select('object_path,digest,final,sequence,mode_epoch,privacy_epoch,birth_revision')
    .eq('run_id', runId).eq('user_id', scope.userId).eq('profile_id', scope.personId)
    .order('sequence', { ascending: false }).limit(1).single();
  if (receipt.error || !receipt.data) throw new Error('Completed Pi run has no durable workspace checkpoint receipt.');
  expect(receipt.data.final).toBe(true);
  expect(receipt.data.object_path.startsWith(`${scope.userId}/${scope.personId}/${runId}/`)).toBe(true);
  const artifact = await admin.storage.from('pi-workspaces').download(receipt.data.object_path);
  if (artifact.error || !artifact.data) throw new Error('Complete workspace archive cannot be downloaded.');
  const bytes = await artifact.data.text();
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.data.digest);
  const saved = JSON.parse(bytes) as PiCheckpoint;
  expect(saved.final).toBe(true);
  expect(saved.sequence).toBe(receipt.data.sequence);
  expect(saved.session.length).toBeGreaterThan(0);
  return { saved, receipt: receipt.data };
}

async function consolidation(admin: SupabaseClient, scope: Scope, messageId: string) {
  const source = await admin.from('person_source_items').select('source_seq').eq('user_id', scope.userId)
    .eq('profile_id', scope.personId).eq('source_message_id', messageId).single();
  if (source.error || !source.data) throw new Error('Native user source was not created.');
  await expect.poll(async () => {
    const result = await admin.from('person_jobs').select('state').eq('user_id', scope.userId).eq('profile_id', scope.personId)
      .eq('job_kind', 'source_consolidation').lte('source_from_seq', source.data.source_seq).gte('source_to_seq', source.data.source_seq)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error('Consolidation receipt unavailable.');
    return result.data?.state;
  }, { timeout: 720_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(completed|failed)$/);
  const head = await admin.from('person_model_heads').select('current_revision,processed_source_seq')
    .eq('user_id', scope.userId).eq('profile_id', scope.personId).single();
  if (head.error || !head.data) throw new Error('Published personal memory head unavailable.');
  expect(head.data.current_revision).toBeGreaterThan(0);
  expect(head.data.processed_source_seq).toBeGreaterThanOrEqual(source.data.source_seq);
}

async function waitForOwnedWorkToSettle(admin: SupabaseClient, userId: string) {
  let idleSince = 0;
  await expect.poll(async () => {
    const [runs, jobs] = await Promise.all([
      admin.from('astro_agent_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      admin.from('person_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('state', ['pending', 'leased', 'running']),
    ]);
    if (runs.error || jobs.error || runs.count == null || jobs.count == null) {
      throw new Error('Synthetic cleanup could not verify that owned workflows are terminal.');
    }
    if (runs.count || jobs.count) { idleSince = 0; return false; }
    idleSince ||= Date.now();
    // Let already-dispatched worker completion finish before cascading its owner.
    return Date.now() - idleSince >= 5_000;
  }, { timeout: 180_000, intervals: [1_000, 2_000, 4_000] }).toBe(true);
}

async function removeOwnedWorkspaceObjects(admin: SupabaseClient, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Synthetic cleanup owner identifier is invalid.');
  const bucket = admin.storage.from('pi-workspaces');
  const paths: string[] = [];
  const walk = async (prefix: string, depth: number): Promise<void> => {
    if ((prefix !== userId && !prefix.startsWith(`${userId}/`)) || depth > 10) {
      throw new Error('Synthetic cleanup encountered an unexpected workspace prefix.');
    }
    for (let offset = 0; ; offset += 100) {
      const page = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (page.error || !page.data) throw new Error('Synthetic cleanup could not list its private workspace objects.');
      for (const item of page.data) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(item.name) || item.name === '.' || item.name === '..') {
          throw new Error('Synthetic cleanup encountered an unsafe workspace object name.');
        }
        const path = `${prefix}/${item.name}`;
        if (item.id == null) await walk(path, depth + 1);
        else paths.push(path);
      }
      if (page.data.length < 100) break;
    }
  };
  // Finish every page before deleting anything, so offset pagination cannot skip
  // shifted objects. This includes transfer chunks and uncommitted checkpoints.
  await walk(userId, 0);
  for (let offset = 0; offset < paths.length; offset += 100) {
    const removed = await bucket.remove(paths.slice(offset, offset + 100));
    if (removed.error) throw new Error('Synthetic workspace object cleanup failed.');
  }
  return paths.length;
}

test('Pi workspace: optimistic personal chat, fresh-chat memory, same-chat 2026 Atros timeline', async ({ page }, info) => {
  const url = process.env.P3_STAGING_SUPABASE_URL?.trim();
  const secret = process.env.P3_STAGING_SUPABASE_SECRET_KEY?.trim();
  const pin = process.env.P3_STAGING_SUPABASE_IP?.trim();
  if (process.env.P3_STAGING_E2E !== '1' || process.env.P3_REAL_PROVIDER_E2E !== '1'
    || process.env.P3_STAGING_SUPABASE_REF !== stagingRef || !url || !secret || !pin
    || new URL(url).origin !== `https://${stagingRef}.supabase.co`) {
    throw new Error('Pi system proof only permits the explicitly approved staging project and real provider.');
  }
  setGlobalDispatcher(new Agent({ connect: { lookup(hostname, options, callback) {
    if (hostname === `${stagingRef}.supabase.co`) callback(null, [{ address: pin, family: 4 }]);
    else systemLookup(hostname, options, callback);
  } } }));
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `pi-workspace-${randomUUID()}@example.invalid`;
  const password = `Pi-Proof-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Disposable Pi proof owner creation failed.');
  const userId = created.data.user.id;
  const visualIssues: string[] = [];
  const browserErrors: string[] = [];
  const network: Array<{ method: string; path: string; status: number }> = [];
  let traceStarted = false;
  let primaryFailure: unknown;
  let stage = 'sign-in';
  let personId: string | null = null;
  let settingsPage: Page | null = null;
  try {
    await signIn(page, email, password);
    // Raw traces contain authenticated headers/cookies even after credential
    // entry. Keep them in ignored test-results only; attach safe evidence below.
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false, title: 'Pi proof after authentication' });
    traceStarted = true;
    info.annotations.push({ type: 'sensitive-local-trace', description: 'Tracing begins after sign-in. Raw authenticated trace stays in ignored test-results and must not be published; attached network evidence omits all headers, bodies, cookies and query strings.' });
    page.context().on('response', (response) => { const parsed = new URL(response.url()); if (parsed.pathname.startsWith('/api/astrologer/')) network.push({ method: response.request().method(), path: parsed.pathname, status: response.status() }); });
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    stage = 'name-only profile';
    await page.goto('/astrologer');
    await expect(page.getByRole('heading', { name: 'Whose life are we understanding?' })).toBeVisible();
    await screenshots(page, info, '01-name-only-onboarding', visualIssues);
    const creating = page.waitForResponse((r) => r.url().endsWith('/api/astrologer/profiles') && r.request().method() === 'POST');
    await page.getByLabel('Name').fill('Pi Synthetic Person');
    await page.getByRole('button', { name: /create personal map/i }).click();
    const profileResponse = await creating;
    expect(profileResponse.status()).toBe(201);
    personId = (await profileResponse.json() as { profileId: string }).profileId;
    const scope = { userId, personId };
    await expect(page).toHaveURL(new RegExp(`/astrologer/p/${personId}/profile/life-map$`));
    const profile = await admin.from('astro_profiles').select('name,birth_date,birth_time').eq('id', personId).eq('user_id', userId).single();
    if (profile.error || !profile.data) throw new Error('Name-only profile unavailable.');
    expect(profile.data).toMatchObject({ name: 'Pi Synthetic Person', birth_date: null, birth_time: null });
    await screenshots(page, info, '02-personal-life-map', visualIssues);
    const firstSessionId = await newConversation(page, admin, scope);
    stage = 'optimistic and astrology-off Pi answer';
    await expect(page.getByPlaceholder('Tell me what you are exploring…')).toBeEnabled();
    const personal = await send(page, admin, scope, 'I keep a blue paper-crane notebook for questions I want to ask my friend Priya. When a project gets difficult, I often delay asking her for help. Please reflect on that without astrology.', info, visualIssues, true);
    expect(personal.steps.some((step) => step.tool_name?.startsWith('atros_'))).toBe(false);
    const personalArchive = await checkpoint(admin, scope, personal.runId);
    expect(personalArchive.saved.files.some((file) => file.path.startsWith('astrology/'))).toBe(false);
    await page.reload();
    await expect(page.getByText(personal.answer, { exact: true })).toBeVisible();
    await screenshots(page, info, '04-personal-answer-reloaded', visualIssues);
    stage = 'memory consolidation and second chat';
    await consolidation(admin, scope, personal.messageId);
    const recallSessionId = await newConversation(page, admin, scope);
    expect(recallSessionId).not.toBe(firstSessionId);
    const recall = await send(page, admin, scope, 'What did I tell you about my notebook and whom I delay asking for help? Use my earlier personal sources rather than guessing.', info, visualIssues);
    expect(recall.answer).toMatch(/paper.?crane|blue/i);
    expect(recall.answer).toMatch(/Priya/i);
    expect(recall.steps.some((step) => step.tool_name?.startsWith('atros_'))).toBe(false);
    await screenshots(page, info, '05-fresh-chat-personal-memory', visualIssues);
    stage = 'birth setup and astrology enablement';
    // Keep the original personal chat mounted while Settings changes in another
    // authenticated tab; focusing it must refresh its presentation in place.
    await page.goto(`/astrologer/p/${personId}/chat/${firstSessionId}`);
    await expect(page.getByPlaceholder('Tell me what you are exploring…')).toBeEnabled();
    settingsPage = await page.context().newPage();
    settingsPage.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    settingsPage.on('pageerror', (error) => browserErrors.push(error.message));
    await settingsPage.goto(`/astrologer/p/${personId}/settings`);
    await expect(settingsPage.getByTestId('birth-setup-form')).toBeVisible();
    await screenshots(settingsPage, info, '06-birth-settings', visualIssues);
    await settingsPage.getByLabel('Birth date').fill('1991-02-03');
    await settingsPage.getByLabel('Birth time (HH:MM)').fill('04:56');
    await settingsPage.getByLabel('Birth place').fill('Bengaluru');
    const suggestion = settingsPage.getByRole('listbox', { name: 'Birth place results' }).getByRole('option', { name: /Bengaluru/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await settingsPage.getByLabel('Time source').selectOption('hospital');
    await settingsPage.getByLabel('Time confidence').selectOption('exact');
    const saving = settingsPage.waitForResponse((r) => r.url().endsWith(`/api/astrologer/profiles/${personId}/birth`) && r.request().method() === 'POST');
    await settingsPage.getByTestId('birth-submit').click();
    expect((await saving).status()).toBe(202);
    await expect(settingsPage.getByTestId('birth-status')).toContainText(/ready/i, { timeout: 600_000 });
    const ready = await admin.from('astro_profiles').select('chart_json,sensitivity_json,astro_status,birth_date,birth_time')
      .eq('id', personId).eq('user_id', userId).single();
    if (ready.error || !ready.data) throw new Error('Saved birth profile unavailable.');
    expect(ready.data.astro_status).toBe('ready');
    expect(ready.data.chart_json).toBeTruthy();
    expect(ready.data.sensitivity_json).toBeTruthy();
    const astrology = settingsPage.getByRole('switch', { name: 'Astrology layer' });
    await expect(astrology).toHaveAttribute('aria-checked', 'false');
    await Promise.all([settingsPage.waitForEvent('framenavigated', { predicate: (frame) => frame === settingsPage!.mainFrame() }), astrology.click()]);
    await expect(settingsPage.getByRole('switch', { name: 'Astrology layer' })).toHaveAttribute('aria-checked', 'true');
    await screenshots(settingsPage, info, '07-astrology-enabled', visualIssues);
    stage = '2026 timeline in the original personal chat';
    await page.bringToFront();
    await expect(page).toHaveURL(`/astrologer/p/${personId}/chat/${firstSessionId}`);
    await expect(page.getByPlaceholder('Ask your companion…')).toBeEnabled();
    await expect(page.getByText('Private · Astrology on', { exact: true })).toBeVisible();
    await settingsPage.close();
    settingsPage = null;
    const dasha = await send(page, admin, scope, 'Tell me about my Vimshottari maha and antar dashas for calendar year 2026, from 2026-01-01 through 2026-12-31. Calculate from my saved birth details and give the actual dated period boundaries as YYYY-MM-DD dates. Explain them as a reflective lens rather than a deterministic prediction.', info, visualIssues);
    expect(dasha.steps).toEqual(expect.arrayContaining([expect.objectContaining({ tool_name: 'atros_timeline', status: 'succeeded' })]));
    expect(dasha.answer).toMatch(/2026-\d{2}-\d{2}/);
    const archive = await checkpoint(admin, scope, dasha.runId);
    const calculationReceipt = archive.saved.files.find((file) => file.path.startsWith(`astrology/calculations/${dasha.runId}-`) && file.path.endsWith('/receipt.json')
      && (JSON.parse(file.content) as { name?: string }).name === 'atros_timeline');
    expect(calculationReceipt, 'The complete timeline calculation and its receipt must survive outside the VM.').toBeTruthy();
    const calculation = JSON.parse(calculationReceipt!.content) as { name: string; args: string[]; result: string };
    expect(calculation.args).toEqual(expect.arrayContaining(['--from', '2026-01-01', '--to', '2026-12-31']));
    const fullResult = archive.saved.files.find((file) => file.path === calculation.result);
    expect(fullResult).toBeTruthy();
    const result = JSON.parse(fullResult!.content) as unknown;
    expect(JSON.stringify(result)).toMatch(/2026-\d{2}-\d{2}/);
    expect(archive.saved.answer?.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n').trim()).toBe(dasha.answer);
    await page.reload();
    await expect(page.getByText(dasha.answer, { exact: true })).toBeVisible();
    await screenshots(page, info, '08-atros-2026-answer-reloaded', visualIssues);
    stage = 'same-mode session and calculation-file restore';
    const followup = await send(page, admin, scope, 'Use the timeline result you just saved: which maha and antar period includes 2026-01-01? Repeat its dated boundaries and keep this answer concise.', info, visualIssues);
    const continued = await checkpoint(admin, scope, followup.runId);
    expect(continued.saved.files.find((file) => file.path === calculation.result)?.content).toBe(fullResult!.content);
    expect(followup.answer).toMatch(/\d{4}-\d{2}-\d{2}/);
    await screenshots(page, info, '09-restored-calculation-followup', visualIssues);
    await info.attach('pi-workspace-proof', { body: JSON.stringify({ userId, personId, firstSessionId, recallSessionId,
      personalRunId: personal.runId, recallRunId: recall.runId, astrologyRunId: dasha.runId,
      followupRunId: followup.runId,
      checkpointSequence: archive.receipt.sequence, checkpointDigest: archive.receipt.digest,
      timelineResultBytes: Buffer.byteLength(fullResult!.content), successfulTool: 'atros_timeline' }, null, 2), contentType: 'application/json' });
    expect(visualIssues).toEqual([]);
    expect(browserErrors).toEqual([]);
  } catch (error) {
    primaryFailure = error;
    info.annotations.push({ type: 'failed-stage', description: stage });
    await screenshots(settingsPage ?? page, info, `failure-${stage.replace(/[^a-z0-9]+/gi, '-')}`, visualIssues).catch(() => {});
    throw error;
  } finally {
    await info.attach('safe-network-statuses', { body: JSON.stringify(network, null, 2), contentType: 'application/json' });
    await info.attach('responsive-issues', { body: JSON.stringify(visualIssues, null, 2), contentType: 'application/json' });
    if (traceStarted) await page.context().tracing.stop({ path: info.outputPath('SENSITIVE-LOCAL-ONLY-after-auth-trace.zip') }).catch(() => {});
    await settingsPage?.close().catch(() => {});
    await page.context().clearCookies();
    try {
      // Refuse to delete the owner beneath active workers. If this bounded wait
      // fails, preserve its evidence and report exact-owner cleanup as unfinished.
      await waitForOwnedWorkToSettle(admin, userId);
      const removedObjects = await removeOwnedWorkspaceObjects(admin, userId);
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw new Error('Synthetic proof owner cleanup failed.');
      info.annotations.push({ type: 'cleanup', description: `Exact disposable owner and ${removedObjects} private checkpoint/transfer objects removed after owned workflows became terminal.` });
    } catch (error) {
      info.annotations.push({ type: 'cleanup-failed', description: `Disposable owner ${userId} requires cleanup.` });
      if (!primaryFailure) throw error;
    }
  }
});
