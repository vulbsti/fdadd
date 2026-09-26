import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

if (process.env.P3_STAGING_E2E === '1') {
  throw new Error('Local system proof refuses staging mode; use playwright.system-staging.config.ts.');
}
const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://localhost:9002';
const base = new URL(baseURL);
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
  throw new Error('Local system proof requires a loopback web server.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'system-pipeline.spec.ts',
  outputDir: 'test-results/system-pipeline-local',
  timeout: 1_800_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: base.origin,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'system-pipeline', use: { ...devices['Desktop Chrome'], viewport: { width: 1586, height: 992 } } }],
  webServer: {
    command: process.env.E2E_WEB_SERVER_COMMAND?.trim() || `npm exec -- next dev --turbopack -p ${base.port || '9002'}`,
    url: base.origin,
    reuseExistingServer: !process.env.CI && process.env.E2E_FORCE_NEW_SERVER !== '1',
    timeout: 120_000,
  },
});
