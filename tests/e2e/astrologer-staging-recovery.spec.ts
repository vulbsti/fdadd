import { expect, test } from '@playwright/test';

interface SessionDetail {
  session: {
    currentQuestion: { prompt: string } | null;
  };
  latestRun: {
    id: string;
    status: string;
    phase: string | null;
    resumeFromRunId: string | null;
  } | null;
  messages: Array<{ id: string; runId: string | null; role: string; content: string }>;
}

test('staging scheduler failure resumes, persists, and reloads visually', async ({ page }, testInfo) => {
  const email = process.env.P1_STAGING_E2E_EMAIL?.trim();
  const password = process.env.P1_STAGING_E2E_PASSWORD?.trim();
  const sessionId = process.env.P1_STAGING_E2E_SESSION_ID?.trim();
  const failedRunId = process.env.P1_STAGING_E2E_FAILED_RUN_ID?.trim();
  const originalRequest = process.env.P1_STAGING_E2E_REQUEST?.trim();
  if (!email || !password || !sessionId || !failedRunId || !originalRequest) {
    throw new Error('Hosted P1 proof is missing its disposable fixture identity.');
  }

  const loadDetail = async (): Promise<SessionDetail> => {
    const response = await page.request.get(`/api/astrologer/sessions/${sessionId}`);
    expect(response.status()).toBe(200);
    return response.json() as Promise<SessionDetail>;
  };

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
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });

  await page.goto('/astrologer');
  await expect(page).toHaveURL(/\/astrologer$/);
  await expect(page.getByText('P1 scheduled recovery')).toBeVisible();
  await expect(page.getByText(originalRequest, { exact: true })).toBeVisible();

  const resumeButton = page.getByRole('button', { name: /^resume$/i });
  if (await resumeButton.isVisible().catch(() => false)) {
    await page.screenshot({
      path: testInfo.outputPath(`staging-scheduler-provider-failure-${testInfo.project.name}.png`),
      fullPage: true,
    });
    const resumed = page.waitForResponse((response) =>
      response.url().endsWith(`/api/astrologer/runs/${failedRunId}/resume`)
      && response.request().method() === 'POST');
    await resumeButton.click();
    expect((await resumed).status()).toBe(202);
  }

  await expect.poll(async () => (await loadDetail()).latestRun?.status, {
    timeout: 240_000,
    intervals: [1000, 2000, 3000, 5000],
  }).toMatch(/^(waiting_for_user|complete)$/);

  const detail = await loadDetail();
  expect(detail.latestRun?.resumeFromRunId).toBe(failedRunId);
  expect(detail.latestRun?.phase).toBeNull();
  const answer = detail.messages.find((message) =>
    message.runId === detail.latestRun?.id && message.role === 'assistant');
  expect(answer?.content.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByText(originalRequest, { exact: true })).toBeVisible();
  await expect(page.getByText(answer!.content, { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(detail.session.currentQuestion?.prompt).toBeTruthy();
  await expect(page.getByText(detail.session.currentQuestion!.prompt, { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Ask your astrologer…')).toBeVisible();
  await expect(page.getByPlaceholder('Ask your astrologer…')).toBeEnabled();
  await expect(page.getByText('RESPONDING', { exact: true })).toHaveCount(0);
  await expect(page.getByText('The last run failed.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^resume$/i })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(`staging-scheduler-recovered-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
