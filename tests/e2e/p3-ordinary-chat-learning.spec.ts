import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lookup as systemLookup } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

const providerGate = process.env.P3_REAL_PROVIDER_E2E === '1';
test.skip(!providerGate, 'P3 ordinary-chat E2E requires explicit opt-in to real configured provider calls; this is not a fixture-backed pass.');

const stagingRef = 'wtloawiwntyjiidjbmuk';
const stagingPreviewHost = 'fdadd-git-feature-redesignv2-vulbstis-projects.vercel.app';

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function supabaseTarget() {
  const stagingMode = process.env.P3_STAGING_E2E === '1';
  const url = stagingMode ? process.env.P3_STAGING_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = stagingMode ? process.env.P3_STAGING_SUPABASE_SECRET_KEY : process.env.SUPABASE_SECRET_KEY;
  const publishable = stagingMode ? process.env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const providerConfigured = Boolean(process.env.OPENCODE_API_KEY || process.env.OPENGO_API || process.env.OPENROUTER_API_KEY);
  if (!url || !secret || !publishable) throw new Error('P3 E2E requires explicit disposable Supabase configuration.');
  const supabase = new URL(url);
  const host = supabase.hostname;
  if (stagingMode) {
    const expectedRef = process.env.P3_STAGING_SUPABASE_REF;
    const expectedPreview = process.env.P3_STAGING_PREVIEW_URL;
    const preview = expectedPreview ? new URL(expectedPreview) : undefined;
    const configuredPreview = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL) : undefined;
    if (expectedRef !== stagingRef) throw new Error('P3 hosted proof refuses a Supabase ref other than the approved staging project.');
    if (supabase.protocol !== 'https:' || supabase.hostname !== `${stagingRef}.supabase.co`
      || supabase.username || supabase.password || supabase.pathname !== '/' || supabase.search || supabase.hash) {
      throw new Error('P3 hosted proof refuses a Supabase URL outside the approved staging project.');
    }
    const stagingIp = process.env.P3_STAGING_SUPABASE_IP;
    if (!stagingIp || !isIPv4(stagingIp)) {
      throw new Error('P3 hosted proof requires an explicit IPv4 pin for the approved Supabase staging host.');
    }
    setGlobalDispatcher(new Agent({
      connect: {
        lookup(hostname, options, callback) {
          if (hostname === supabase.hostname) {
            callback(null, [{ address: stagingIp, family: 4 }]);
            return;
          }
          systemLookup(hostname, options, callback);
        },
      },
    }));
    if (!preview || preview.protocol !== 'https:' || preview.hostname !== stagingPreviewHost
      || preview.pathname !== '/' || preview.search || preview.hash
      || !configuredPreview || configuredPreview.href !== preview.href) {
      throw new Error('P3 hosted proof requires the exact feature/redesignv2 branch Preview URL in both P3_STAGING_PREVIEW_URL and E2E_BASE_URL.');
    }
    if (['aidoraa.com', 'www.aidoraa.com', 'fdadd.vercel.app'].includes(preview.hostname)) {
      throw new Error('P3 hosted proof refuses production aliases.');
    }
    return { url, secret, publishable, stagingMode };
  }
  if (process.env.P3_STAGING_E2E === '1') throw new Error('P3 hosted proof must use playwright.p3-staging.config.ts.');
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !['http:', 'https:'].includes(supabase.protocol)) {
    throw new Error('P3 local proof only permits loopback Supabase.');
  }
  if (!providerConfigured) throw new Error('P3_REAL_PROVIDER_E2E=1 was set, but no configured provider credential is available.');
  return { url, secret, publishable, stagingMode };
}

async function waitForRun(admin: SupabaseClient, runId: string) {
  await expect.poll(async () => {
    const { data, error } = await admin.from('astro_agent_runs').select('status').eq('id', runId).single();
    if (error || !data) throw error ?? new Error('agent run disappeared');
    return data.status;
  }, { timeout: 240_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(waiting_for_user|complete|failed)$/);
  const { data, error } = await admin.from('astro_agent_runs')
    .select('status,output_message_id,error_code').eq('id', runId).single();
  if (error || !data) throw error ?? new Error('agent run result missing');
  if (data.status === 'failed') {
    const steps = await admin.from('astro_agent_run_steps')
      .select('ordinal,kind,status,tool_name,output_summary,refs,cache_hit')
      .eq('run_id', runId).order('ordinal', { ascending: true });
    throw new Error(`answer run failed (${data.error_code ?? 'unknown'}): ${JSON.stringify(steps.data ?? [])}`);
  }
  expect(data.output_message_id).toBeTruthy();
  const { data: message, error: messageError } = await admin.from('astro_messages')
    .select('content').eq('id', data.output_message_id!).single();
  if (messageError || !message) throw messageError ?? new Error('assistant message missing');
  return message.content as string;
}

async function sendOrdinaryMessage(page: Page, admin: SupabaseClient, text: string) {
  const composer = page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]');
  await expect(composer).toBeEnabled();
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/astrologer/chat') && response.request().method() === 'POST');
  await composer.fill(text);
  await composer.press('Enter');
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const body = await response.json() as { runId?: string; messageId?: string };
  expect(body.runId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(body.messageId).toMatch(/^[0-9a-f-]{36}$/i);
  const { data: savedUserMessage, error } = await admin.from('astro_messages')
    .select('id,role,content').eq('id', body.messageId!).single();
  if (error || !savedUserMessage) throw error ?? new Error('accepted user message missing');
  expect(savedUserMessage.role).toBe('user');
  expect(savedUserMessage.content).toBe(text);
  const answer = await waitForRun(admin, body.runId!);
  await expect(page.getByText(answer, { exact: true })).toBeVisible({ timeout: 30_000 });
  return { runId: body.runId!, messageId: body.messageId!, answer };
}

async function submitTypedChange(page: Page, personId: string, change: Record<string, unknown>) {
  const response = await page.request.post(`/api/astrologer/profiles/${personId}/changes`, {
    data: change,
  });
  expect(response.status()).toBe(202);
  const body = await response.json() as {
    change_id?: string;
    source_id?: string;
    source_seq?: number;
    job_id?: string;
  };
  expect(body.change_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(body.source_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(body.source_seq).toEqual(expect.any(Number));
  expect(body.job_id).toMatch(/^[0-9a-f-]{36}$/i);
  return {
    changeId: body.change_id!,
    sourceId: body.source_id!,
    sourceSeq: body.source_seq!,
    jobId: body.job_id!,
  };
}

async function waitForConsolidationJob(
  page: Page,
  admin: SupabaseClient,
  userId: string,
  personId: string,
  sourceSeq: number,
  jobId?: string,
) {
  let nudgedAttempt = -1;
  await expect.poll(async () => {
    let query = admin.from('person_jobs')
      .select('id,state,attempt_count,available_at')
      .eq('profile_id', personId).eq('user_id', userId)
      .in('job_kind', ['source_consolidation', 'correction']);
    query = jobId
      ? query.eq('id', jobId)
      : query.lte('source_from_seq', sourceSeq).gte('source_to_seq', sourceSeq)
        .order('created_at', { ascending: false }).limit(1);
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    const job = result.data;
    if (job?.state === 'pending' && (!job.available_at || Date.parse(job.available_at) <= Date.now())
      && job.attempt_count !== nudgedAttempt) {
      nudgedAttempt = job.attempt_count;
      await nudgeRecoverySweep(page);
    }
    return job?.state ?? null;
  }, { timeout: 720_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(completed|failed)$/);
  let query = admin.from('person_jobs')
    .select('id,state,source_from_seq,source_to_seq,result_revision,last_error_code')
    .eq('profile_id', personId).eq('user_id', userId)
    .in('job_kind', ['source_consolidation', 'correction']);
  query = jobId
    ? query.eq('id', jobId)
    : query.lte('source_from_seq', sourceSeq).gte('source_to_seq', sourceSeq)
      .order('created_at', { ascending: false }).limit(1);
  const result = await query.maybeSingle();
  if (result.error || !result.data) throw result.error ?? new Error('consolidation job missing');
  expect(result.data.state, `consolidation failed (${result.data.last_error_code ?? 'unknown'})`).toBe('completed');
  expect(result.data.result_revision).toBeGreaterThan(0);
  return result.data;
}

async function nudgeRecoverySweep(page: Page): Promise<void> {
  const secret = process.env.P3_STAGING_E2E === '1'
    ? process.env.P3_STAGING_CRON_SECRET
    : process.env.CRON_SECRET;
  const response = await page.request.get('/api/cron/astrologer-dispatch', {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
  expect(response.ok(), `dispatch recovery sweep failed (${response.status()})`).toBe(true);
}

async function deleteDisposableUser(admin: SupabaseClient, userId: string): Promise<Error | null> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (!deleted.error || deleted.error.code === 'user_not_found') return null;
      lastError = deleted.error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Disposable-user cleanup failed.');
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  return lastError;
}

async function signInThroughVisibleUi(page: Page, email: string, password: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  const submit = page.getByRole('button', { name: /^sign in$/i });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  for (let attempt = 0; attempt < 3; attempt++) {
    await submit.click();
    await expect.poll(async () => !(await dialog.isVisible()) || await submit.isEnabled(), {
      timeout: 60_000,
      intervals: [500, 1_000, 2_000],
    }).toBe(true);
    if (!(await dialog.isVisible())) return;
  }
  const dialogText = (await dialog.textContent())?.replaceAll(/\s+/g, ' ').slice(0, 300);
  throw new Error(`Visible sign-in did not complete after bounded retries: ${dialogText ?? 'no dialog status'}`);
}

async function captureResponsive(page: Page, testInfo: TestInfo, personId: string, state: string) {
  const viewports = [
    { label: 'wide', width: 1586, height: 992 },
    { label: 'laptop', width: 1366, height: 768 },
    { label: 'mobile', width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (state === 'life-map-published' && viewport.label === 'mobile') {
      const pathsTab = page.getByRole('link', { name: 'Paths ahead' });
      await pathsTab.scrollIntoViewIfNeeded();
      await expect(pathsTab).toBeVisible();
      await page.getByRole('link', { name: 'Life map' }).scrollIntoViewIfNeeded();
    }
    if (state === 'pattern-source-drawer-open') {
      const drawerButton = page.getByRole('button', { name: /why this appears/i });
      await expect(drawerButton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText(/linked source account|linked source accounts/i)).toBeVisible();
      await drawerButton.scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: testInfo.outputPath(`p3-${state}-${viewport.label}.png`),
      fullPage: false,
    });
    if (viewport.label === 'mobile' && ['life-map-published', 'guided-chat-context', 'guided-chat-reloaded'].includes(state)) {
      if (state === 'life-map-published') {
        const lowerContent = page.getByRole('heading', { name: 'Questions worth exploring' });
        await lowerContent.scrollIntoViewIfNeeded();
        await expect(lowerContent).toBeVisible();
      } else {
        const composer = page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]');
        await composer.scrollIntoViewIfNeeded();
        await expect(composer).toBeVisible();
      }
      await page.screenshot({
        path: testInfo.outputPath(`p3-${state}-${viewport.label}-lower.png`),
        fullPage: false,
      });
    }
  }
  expect(personId).toMatch(/^[0-9a-f-]{36}$/i);
}

const correctionOnly = process.env.P3_CORRECTION_ONLY_E2E === '1';
const prototypeOnly = process.env.P3_PROTOTYPE_E2E === '1';
const dataOnly = correctionOnly || process.env.P3_DATA_ONLY_E2E === '1';

test(correctionOnly
  ? 'P3: a typed correction publishes a new revision while retaining history'
  : prototypeOnly
    ? 'P3 prototype: ordinary chat learns, publishes, renders, and informs a fresh chat'
  : dataOnly
    ? 'P3: correction and counterexample revise the model across independent chats'
    : 'P3: an ordinary chat source publishes a supported person revision and carries into an explored new chat', async ({ page }, testInfo) => {
  test.setTimeout(1_200_000);
  const { url, secret, publishable } = supabaseTarget();
  const admin: SupabaseClient = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = `p3-chat-${crypto.randomUUID()}@example.invalid`;
  const password = `P3-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('local disposable user creation failed');
  const userId = created.data.user.id;
  let userClient: SupabaseClient | undefined;
  let primaryError: unknown;
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));

  try {
    userClient = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
    const signed = await userClient.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const personResult = await userClient.rpc('person_create', { p_name: 'P3 Synthetic', p_command_id: crypto.randomUUID() });
    if (personResult.error) throw personResult.error;
    const personId = (personResult.data as { profileId?: string }).profileId;
    expect(personId).toMatch(/^[0-9a-f-]{36}$/i);
    const sessionResult = await userClient.rpc('create_astro_session', { p_profile_id: personId });
    if (sessionResult.error) throw sessionResult.error;
    const sessionId = (sessionResult.data as { sessionId?: string }).sessionId;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    const { data: initialHead, error: initialHeadError } = await admin.from('person_model_heads')
      .select('current_revision,processed_source_seq').eq('profile_id', personId!).eq('user_id', userId).single();
    if (initialHeadError || !initialHead) throw initialHeadError ?? new Error('person baseline head missing');

    await page.goto('/');
    await expect(page.locator('header .animate-pulse')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.intro-veil')).toHaveClass(/is-lifted/, { timeout: 10_000 });
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /toggle menu|open navigation/i }).click();
    await page.getByRole('button', { name: /login/i }).click();
    await signInThroughVisibleUi(page, email, password);
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.evaluate(async () =>
      (await fetch('/api/astrologer/profiles', { credentials: 'include' })).status), {
      timeout: 30_000,
      intervals: [250, 500, 1_000],
    }).toBe(200);
    await page.goto(`/astrologer/p/${personId}/chat/${sessionId}`);
    await expect(page.getByPlaceholder('Tell me what you are exploring…')).toBeEnabled({ timeout: 30_000 });

    const ordinaryChat = 'At 15, while completing a school project, I kept returning to a question about how people make choices. Finishing that project made me want to build tools that help people understand themselves. Later, studying conflicting ideas challenged that goal, and I have not worked out what it means to me now. Working alone can help when I have one clear problem and can give it sustained attention. But when quiet stretches become prolonged isolation, my energy and momentum can drop. A bounded day alone can still go well when I make progress and have the social contact I want.';
    const firstTurn = await sendOrdinaryMessage(page, admin, ordinaryChat);

    // Observe only: no service writes to source, candidate, object, or revision
    // tables occur in this spec. The single source must be created by the UI's
    // ordinary chat transaction, and the P3 worker must publish it.
    await expect.poll(async () => {
      const result = await admin.from('person_source_items')
        .select('id')
        .eq('profile_id', personId!).eq('user_id', userId).eq('source_message_id', firstTurn.messageId).maybeSingle();
      if (result.error) throw result.error;
      return Boolean(result.data);
    }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(true);
    const { data: source, error: sourceError } = await admin.from('person_source_items')
      .select('id,source_seq,source_kind,speaker_role,subject_kind,source_message_id,inclusion_status')
      .eq('profile_id', personId!).eq('user_id', userId).eq('source_message_id', firstTurn.messageId).single();
    if (sourceError || !source) throw sourceError ?? new Error('ordinary chat source was not registered');
    expect(source.source_kind).toBe('native_message');
    expect(source.speaker_role).toBe('user');
    expect(source.subject_kind).toBe('self');
    expect(source.inclusion_status).toBe('included');

    let nudgedAttempt = -1;
    await expect.poll(async () => {
      const result = await admin.from('person_jobs')
        .select('state,attempt_count,available_at')
        .eq('profile_id', personId!).eq('user_id', userId).eq('job_kind', 'source_consolidation')
        .eq('source_from_seq', source.source_seq).eq('source_to_seq', source.source_seq)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw result.error;
      const job = result.data;
      // Local runs have no scheduler. Kick only once per eligible attempt;
      // staging is a dedicated test project, so this remains a bounded sweep
      // instead of spending on every poll or mutating job tables directly.
      if (job?.state === 'pending' && (!job.available_at || Date.parse(job.available_at) <= Date.now())
        && job.attempt_count !== nudgedAttempt) {
        nudgedAttempt = job.attempt_count;
        await nudgeRecoverySweep(page);
      }
      return job?.state ?? null;
    }, { timeout: 720_000, intervals: [1_000, 2_000, 4_000] }).toMatch(/^(completed|failed)$/);
    const { data: job, error: jobError } = await admin.from('person_jobs')
      .select('id,state,source_from_seq,source_to_seq,result_revision,last_error_code')
      .eq('profile_id', personId!).eq('user_id', userId).eq('job_kind', 'source_consolidation')
      .eq('source_from_seq', source.source_seq).eq('source_to_seq', source.source_seq)
      .order('created_at', { ascending: false }).limit(1).single();
    if (jobError || !job) throw jobError ?? new Error('source consolidation job missing');
    if (job.state === 'failed') {
      await page.goto(`/astrologer/p/${personId}/profile/life-map`);
      const modelResponse = await page.request.get(`/api/astrologer/profiles/${personId}/model`);
      expect(modelResponse.ok()).toBe(true);
      const model = await modelResponse.json() as { updateState?: string };
      if (model.updateState === 'failed') {
        await expect(page.getByRole('alert')).toContainText('latest update could not be completed');
        await captureResponsive(page, testInfo, personId!, 'consolidation-failed-last-valid-view');
      }
      throw new Error(`P3 source consolidation failed (${job.last_error_code ?? 'no error code'}); see job state and failure-state screenshots if the UI exposed them.`);
    }
    expect(job.state).toBe('completed');
    expect(job.last_error_code).toBeNull();
    expect(job.result_revision).toBeGreaterThan(initialHead.current_revision);

    const { data: revision, error: revisionError } = await admin.from('person_model_revisions')
      .select('revision_no,processed_source_seq,brief,verifier_receipt')
      .eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', job.result_revision).single();
    if (revisionError || !revision) throw revisionError ?? new Error('published revision missing');
    expect(revision.processed_source_seq).toBeGreaterThanOrEqual(source.source_seq);

    const { data: members, error: membersError } = await admin.from('person_revision_objects')
      .select('object_id,object_version_id').eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', revision.revision_no);
    if (membersError || !members) throw membersError ?? new Error('revision members missing');
    const versionIds = members.map((member) => member.object_version_id);
    expect(versionIds.length).toBeGreaterThan(0);
    const [
      { data: versions, error: versionsError },
      { data: support, error: supportError },
      { data: observationSupport, error: observationSupportError },
    ] = await Promise.all([
      admin.from('person_object_versions').select('id,object_id,epistemic_class,lifecycle,typed_payload')
        .eq('profile_id', personId!).eq('user_id', userId).in('id', versionIds),
      admin.from('person_object_version_support').select('object_version_id,source_item_id,observation_id,relation')
        .eq('profile_id', personId!).eq('user_id', userId).eq('source_item_id', source.id),
      admin.from('person_object_version_support').select('object_version_id,observation_id,relation')
        .eq('profile_id', personId!).eq('user_id', userId).in('object_version_id', versionIds)
        .not('observation_id', 'is', null),
    ]);
    if (versionsError || !versions) throw versionsError ?? new Error('published object versions missing');
    if (supportError || !support) throw supportError ?? new Error('object/source support rows missing');
    if (observationSupportError || !observationSupport) throw observationSupportError ?? new Error('object/observation support rows missing');
    const supportedIds = new Set(support.map((row) => row.object_version_id));
    const supported = versions.filter((version) => supportedIds.has(version.id) && version.lifecycle === 'active');
    const observationIds = [...new Set(observationSupport.flatMap((row) => row.observation_id ? [row.observation_id] : []))];
    const { data: observations, error: observationsError } = observationIds.length
      ? await admin.from('person_observations')
        .select('id,source_item_id,span_start,span_end,exact_quote,subject_kind,assertion_type')
        .eq('profile_id', personId!).eq('user_id', userId).in('id', observationIds)
      : { data: [], error: null };
    if (observationsError || !observations) throw observationsError ?? new Error('claim-level source observations missing');
    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      expect(observation.source_item_id).toBe(source.id);
      expect(observation.subject_kind).toBe('self');
      expect(observation.assertion_type).toBe('direct');
      expect(ordinaryChat.slice(observation.span_start!, observation.span_end!)).toBe(observation.exact_quote);
    }
    const kinds = supported.map((version) => (version.typed_payload as { kind?: string }).kind ?? '');
    // Require the meanings actually supported by this account. A single
    // message must not be forced to fabricate every ontology kind (especially
    // a chapter); temporal material may validly be represented as a goal.
    expect(kinds).toEqual(expect.arrayContaining(['meaning_change', 'pattern']));
    expect(kinds.some((kind) => kind === 'episode' || kind === 'goal')).toBe(true);
    const meaning = supported.find((version) => (version.typed_payload as { kind?: string }).kind === 'meaning_change')!;
    // The account itself is reported; the unresolved field inside it remains
    // unknown. Collapsing the whole object to unknown would lose provenance.
    expect(meaning.epistemic_class).toBe('reported');
    expect(meaning.typed_payload).toMatchObject({ laterMeaning: null, laterMeaningStatus: 'unknown' });
    const pattern = supported.find((version) => (version.typed_payload as { kind?: string }).kind === 'pattern')!;
    expect((pattern.typed_payload as { exceptions?: unknown[] }).exceptions?.length).toBeGreaterThan(0);

    const modelResponse = await page.request.get(`/api/astrologer/profiles/${personId}/model`);
    expect(modelResponse.ok()).toBe(true);
    const model = await modelResponse.json() as { personRevision: number; sourceWatermark: number; brief: string; mode: string };
    expect(model.personRevision).toBe(revision.revision_no);
    expect(model.sourceWatermark).toBeGreaterThanOrEqual(source.source_seq);
    expect(model.mode).toBe('personal');
    const lifeMapResponse = await page.request.get(`/api/astrologer/profiles/${personId}/views/life-map`);
    expect(lifeMapResponse.ok()).toBe(true);
    const lifeMap = await lifeMapResponse.json() as { personRevision: number; nodes: Array<{ id: string; kind: string; payload: Record<string, unknown> }> };
    expect(lifeMap.personRevision).toBe(revision.revision_no);
    expect(lifeMap.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(['meaning_change', 'pattern']));
    expect(lifeMap.nodes.some((node) => node.kind === 'episode' || node.kind === 'goal')).toBe(true);

    const patternNode = lifeMap.nodes.find((node) => node.kind === 'pattern')!;
    if (!dataOnly) {
      await page.goto(`/astrologer/p/${personId}/profile/life-map`);
      await expect(page.getByRole('heading', { name: 'The life behind your choices' })).toBeVisible();
      await captureResponsive(page, testInfo, personId!, 'life-map-published');

      await page.goto(`/astrologer/p/${personId}/profile/patterns/${patternNode.id}`);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await captureResponsive(page, testInfo, personId!, 'pattern-view');
      const sourceDrawer = page.getByRole('button', { name: /why this appears/i });
      await expect(sourceDrawer).toHaveAttribute('aria-expanded', 'false');
      await sourceDrawer.click();
      await expect(sourceDrawer).toHaveAttribute('aria-expanded', 'true');
      await sourceDrawer.focus();
      await sourceDrawer.press('Space');
      await expect(sourceDrawer).toHaveAttribute('aria-expanded', 'false');
      await sourceDrawer.press('Enter');
      await expect(sourceDrawer).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText(/linked source account|linked source accounts/i)).toBeVisible();
      await expect(page.getByText(/counterevidence|supporting account|qualifying account/i).first()).toBeVisible();
      const objectResponse = await page.request.get(`/api/astrologer/profiles/${personId}/objects/${patternNode.id}`);
      expect(objectResponse.ok()).toBe(true);
      const objectProjection = await objectResponse.json() as {
        sources: Array<{ exactQuote: string | null; assertionType: string; speaker: string }>;
      };
      const visibleQuote = objectProjection.sources.find((item) => item.exactQuote
        && item.assertionType === 'direct' && item.speaker === 'user')?.exactQuote;
      expect(visibleQuote, 'object projection must expose at least one eligible direct user quote').toBeTruthy();
      await expect(page.getByText(visibleQuote!, { exact: false }).first()).toBeVisible();
      await captureResponsive(page, testInfo, personId!, 'pattern-source-drawer-open');

      const chapterNode = lifeMap.nodes.find((node) => node.kind === 'chapter');
      if (chapterNode) {
        await page.goto(`/astrologer/p/${personId}/profile/life-map/chapters/${chapterNode.id}`);
        await expect(page.getByRole('heading').first()).toBeVisible();
        await captureResponsive(page, testInfo, personId!, 'chapter-published');
      } else {
        await page.goto(`/astrologer/p/${personId}/profile/patterns/${patternNode.id}`);
      }
      await page.getByRole('button', { name: /explore in chat/i }).click();
      await expect(page).toHaveURL(new RegExp(`/astrologer/p/${personId}/chat/`));
      const exploredSessionId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
      expect(exploredSessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(exploredSessionId).not.toBe(sessionId);
      await expect(page.getByText(/Exploring a connection in your life/i)).toBeVisible();
      await expect(page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]')).toBeEnabled({ timeout: 30_000 });
      await captureResponsive(page, testInfo, personId!, 'guided-chat-context');
    }

    if (prototypeOnly) {
      const retrievalSessionResult = await userClient.rpc('create_astro_session', { p_profile_id: personId });
      if (retrievalSessionResult.error) throw retrievalSessionResult.error;
      const retrievalSessionId = (retrievalSessionResult.data as { sessionId?: string }).sessionId;
      expect(retrievalSessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(retrievalSessionId).not.toBe(sessionId);
      await page.goto(`/astrologer/p/${personId}/chat/${retrievalSessionId}`);
      await expect(page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]')).toBeEnabled({ timeout: 30_000 });
      const retrievalTurn = await sendOrdinaryMessage(
        page,
        admin,
        'What have you learned about the conditions under which time working alone helps or hurts my energy and progress?',
      );
      const { data: planReceipt, error: planReceiptError } = await admin.from('astro_agent_run_steps')
        .select('refs').eq('run_id', retrievalTurn.runId).eq('kind', 'plan')
        .order('ordinal', { ascending: true }).limit(1).single();
      if (planReceiptError || !planReceipt) throw planReceiptError ?? new Error('fresh-chat person-context receipt missing');
      const refs = planReceipt.refs as {
        personRevision?: number;
        personObjectIds?: string[];
      };
      expect(refs.personRevision).toBe(revision.revision_no);
      expect(refs.personObjectIds).toEqual(expect.arrayContaining(members.map((member) => member.object_id)));
      expect(retrievalTurn.answer).toMatch(/clear|bounded|sustained|progress/i);
      expect(retrievalTurn.answer).toMatch(/isolation|prolonged|energy|momentum/i);
      await page.reload();
      await expect(page.getByText(retrievalTurn.answer, { exact: true })).toBeVisible({ timeout: 30_000 });
      await captureResponsive(page, testInfo, personId!, 'guided-chat-reloaded');
      expect(browserErrors).toEqual([]);
      return;
    }

    // A later correction is submitted through the authenticated typed-change
    // API, not by inserting a synthetic message. The API immediately records
    // the immutable correction/source and invalidates the affected projection;
    // the worker must then publish a new revision from that source.
    const priorPatternVersion = versions.find((version) => version.object_id === patternNode.id);
    expect(priorPatternVersion).toBeTruthy();
    const correction = await submitTypedChange(page, personId!, {
      kind: 'correct_account',
      clientCommandId: crypto.randomUUID(),
      expectedRevision: revision.revision_no,
      targetId: patternNode.id,
      account: {
        correction: 'The draining period was prolonged isolation with less contact; a clear day working alone can be energising, so solitude itself should not be treated as the cause.',
      },
    });
    const { data: recordedCorrection, error: recordedCorrectionError } = await admin.from('person_changes')
      .select('id,source_item_id,source_seq,change_kind,target_id,prior_version_id,request')
      .eq('id', correction.changeId).eq('user_id', userId).eq('profile_id', personId!).single();
    if (recordedCorrectionError || !recordedCorrection) throw recordedCorrectionError ?? new Error('typed correction was not retained');
    expect(recordedCorrection.change_kind).toBe('correction');
    expect(recordedCorrection.target_id).toBe(patternNode.id);
    expect(recordedCorrection.prior_version_id).toBe(priorPatternVersion!.id);
    expect(recordedCorrection.request).toEqual(expect.objectContaining({ kind: 'correct_account' }));
    const { data: correctionSource, error: correctionSourceError } = await admin.from('person_source_items')
      .select('id,source_seq,source_kind,source_message_id,inclusion_status')
      .eq('id', correction.sourceId).eq('user_id', userId).eq('profile_id', personId!).single();
    if (correctionSourceError || !correctionSource) throw correctionSourceError ?? new Error('typed correction source was not retained');
    expect(correctionSource).toEqual(expect.objectContaining({
      source_kind: 'explicit_correction', source_message_id: null, inclusion_status: 'included',
    }));
    expect(correctionSource.source_seq).toBe(correction.sourceSeq);

    const correctionJob = await waitForConsolidationJob(page, admin, userId, personId!, correction.sourceSeq, correction.jobId);
    expect(correctionJob.result_revision).toBeGreaterThan(revision.revision_no);
    const correctionRevisionNo = correctionJob.result_revision;
    const { data: resolvedCorrection, error: resolvedCorrectionError } = await admin.from('person_changes')
      .select('status,resolved_revision').eq('id', correction.changeId).eq('user_id', userId).eq('profile_id', personId!).single();
    if (resolvedCorrectionError || !resolvedCorrection) throw resolvedCorrectionError ?? new Error('typed correction was not resolved');
    expect(resolvedCorrection).toMatchObject({ status: 'resolved', resolved_revision: correctionRevisionNo });
    const { data: retainedFirstRevision, error: retainedFirstRevisionError } = await admin.from('person_model_revisions')
      .select('revision_no,processed_source_seq,brief,verifier_receipt')
      .eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', revision.revision_no).single();
    if (retainedFirstRevisionError || !retainedFirstRevision) throw retainedFirstRevisionError ?? new Error('first revision history was lost after correction');
    expect(retainedFirstRevision.processed_source_seq).toBeGreaterThanOrEqual(source.source_seq);
    expect(retainedFirstRevision.verifier_receipt).toBeTruthy();
    const { data: retainedPriorVersion, error: retainedPriorVersionError } = await admin.from('person_object_versions')
      .select('id,object_id,version_no,typed_payload,lifecycle')
      .eq('id', priorPatternVersion!.id).eq('user_id', userId).eq('profile_id', personId!).single();
    if (retainedPriorVersionError || !retainedPriorVersion) throw retainedPriorVersionError ?? new Error('prior object version was lost after correction');
    expect(retainedPriorVersion.object_id).toBe(patternNode.id);
    expect(retainedPriorVersion.typed_payload).toBeTruthy();
    const { data: correctedMembers, error: correctedMembersError } = await admin.from('person_revision_objects')
      .select('object_id,object_version_id').eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', correctionRevisionNo);
    if (correctedMembersError || !correctedMembers) throw correctedMembersError ?? new Error('corrected revision members missing');
    const correctedPattern = correctedMembers.find((member) => member.object_id === patternNode.id);
    // A correction may revise the object in place or retire it, but it must
    // never leave the old version as the current projection.
    expect(correctedPattern?.object_version_id ?? null).not.toBe(priorPatternVersion!.id);
    if (correctionOnly) return;

    // This is an independent native-message source, deliberately accepted
    // after the correction. It qualifies the old explanation with a separate
    // positive example rather than laundering the correction into a chat turn.
    const counterexampleSessionResult = await userClient.rpc('create_astro_session', { p_profile_id: personId });
    if (counterexampleSessionResult.error) throw counterexampleSessionResult.error;
    const counterexampleSessionId = (counterexampleSessionResult.data as { sessionId?: string }).sessionId;
    expect(counterexampleSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    await page.goto(`/astrologer/p/${personId}/chat/${counterexampleSessionId}`);
    await expect(page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]')).toBeEnabled({ timeout: 30_000 });
    const counterexampleText = 'A separate example is that I recently spent a full day alone on a clear task, kept my energy, and made progress without wanting more social contact. That is a counterexample to treating solitude as inherently draining.';
    const counterexampleTurn = await sendOrdinaryMessage(page, admin, counterexampleText);
    const { data: counterexampleSource, error: counterexampleSourceError } = await admin.from('person_source_items')
      .select('id,source_seq,source_kind,source_message_id,inclusion_status')
      .eq('profile_id', personId!).eq('user_id', userId).eq('source_message_id', counterexampleTurn.messageId).single();
    if (counterexampleSourceError || !counterexampleSource) throw counterexampleSourceError ?? new Error('counterexample source was not retained');
    expect(counterexampleSource.source_kind).toBe('native_message');
    expect(counterexampleSource.source_message_id).toBe(counterexampleTurn.messageId);
    expect(counterexampleSource.inclusion_status).toBe('included');
    expect(counterexampleSource.source_seq).toBeGreaterThan(correction.sourceSeq);
    const counterexampleJob = await waitForConsolidationJob(page, admin, userId, personId!, counterexampleSource.source_seq);
    expect(counterexampleJob.result_revision).toBeGreaterThan(correctionRevisionNo);
    const latestRevisionNo = counterexampleJob.result_revision;
    const { data: latestRevision, error: latestRevisionError } = await admin.from('person_model_revisions')
      .select('revision_no,processed_source_seq,brief,verifier_receipt')
      .eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', latestRevisionNo).single();
    if (latestRevisionError || !latestRevision) throw latestRevisionError ?? new Error('counterexample revision missing');
    expect(latestRevision.processed_source_seq).toBeGreaterThanOrEqual(counterexampleSource.source_seq);
    expect(latestRevision.verifier_receipt).toBeTruthy();
    const { data: latestMembers, error: latestMembersError } = await admin.from('person_revision_objects')
      .select('object_id,object_version_id').eq('profile_id', personId!).eq('user_id', userId).eq('revision_no', latestRevisionNo);
    if (latestMembersError || !latestMembers) throw latestMembersError ?? new Error('latest revision members missing');
    const latestVersionIds = latestMembers.map((member) => member.object_version_id);
    expect(latestVersionIds.length).toBeGreaterThan(0);
    const { data: counterexampleSupport, error: counterexampleSupportError } = await admin.from('person_object_version_support')
      .select('object_version_id,source_item_id,observation_id,relation')
      .eq('profile_id', personId!).eq('user_id', userId).in('object_version_id', latestVersionIds);
    if (counterexampleSupportError || !counterexampleSupport) throw counterexampleSupportError ?? new Error('counterexample support links missing');
    expect(counterexampleSupport.length).toBeGreaterThan(0);
    const latestSupportedSourceIds = new Set(counterexampleSupport.flatMap((row) => row.source_item_id ? [row.source_item_id] : []));
    expect(latestSupportedSourceIds.has(source.id)).toBe(true);
    expect(latestSupportedSourceIds.has(correction.sourceId)).toBe(true);
    expect(latestSupportedSourceIds.has(counterexampleSource.id)).toBe(true);
    const { data: latestVersions, error: latestVersionsError } = await admin.from('person_object_versions')
      .select('id,object_id,epistemic_class,lifecycle,typed_payload').eq('profile_id', personId!).eq('user_id', userId)
      .in('id', latestVersionIds);
    if (latestVersionsError || !latestVersions) throw latestVersionsError ?? new Error('latest object versions missing');
    const latestNarrative = JSON.stringify({ brief: latestRevision.brief, objects: latestVersions.map((item) => item.typed_payload) });
    expect(latestNarrative).not.toMatch(/incapable of discipline|cannot be productive alone|needs social contact to function/i);

    // The corrected model and the independent counterexample must be read in
    // a fresh session that contains neither source turn, with a receipt naming
    // the latest published revision rather than relying on its transcript.
    const retrievalSessionResult = await userClient.rpc('create_astro_session', { p_profile_id: personId });
    if (retrievalSessionResult.error) throw retrievalSessionResult.error;
    const retrievalSessionId = (retrievalSessionResult.data as { sessionId?: string }).sessionId;
    expect(retrievalSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retrievalSessionId).not.toBe(sessionId);
    expect(retrievalSessionId).not.toBe(counterexampleSessionId);
    await page.goto(`/astrologer/p/${personId}/chat/${retrievalSessionId}`);
    await expect(page.locator('input[placeholder="Tell me what you are exploring…"], input[placeholder="Ask your companion…"]')).toBeEnabled({ timeout: 30_000 });
    const revisedTurn = await sendOrdinaryMessage(
      page,
      admin,
      'In this conversation, how does the clear successful day alone qualify the account about prolonged isolation, and what did I correct about the earlier pattern?',
    );
    const { data: revisedPlanReceipt, error: revisedPlanReceiptError } = await admin.from('astro_agent_run_steps')
      .select('refs').eq('run_id', revisedTurn.runId).eq('kind', 'plan')
      .order('ordinal', { ascending: true }).limit(1).single();
    if (revisedPlanReceiptError || !revisedPlanReceipt) throw revisedPlanReceiptError ?? new Error('revised new-chat receipt missing');
    expect((revisedPlanReceipt.refs as { personRevision?: number }).personRevision).toBe(latestRevisionNo);
    expect(revisedTurn.answer).toMatch(/isolation|alone|solitude/i);
    await page.reload();
    await expect(page.getByText(revisedTurn.answer, { exact: true })).toBeVisible({ timeout: 30_000 });
    if (!dataOnly) await captureResponsive(page, testInfo, personId!, 'guided-chat-revised-reloaded');
    expect(browserErrors).toEqual([]);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    // Auth-user deletion cascades only the disposable user's fixture rows.
    await userClient?.auth.signOut();
    await page.context().clearCookies();
    const cleanupError = await deleteDisposableUser(admin, userId);
    // Never hide the actual product/test failure with a secondary cleanup
    // timeout. A clean run still fails if its disposable fixture leaked.
    if (cleanupError && !primaryError) throw cleanupError;
  }
});
