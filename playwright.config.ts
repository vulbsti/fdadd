import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://localhost:9002';
const parsedBaseURL = new URL(baseURL);
if (!['127.0.0.1', 'localhost'].includes(parsedBaseURL.hostname)) {
  throw new Error('P0 browser smoke is local-only; E2E_BASE_URL must be loopback.');
}
const devPort = parsedBaseURL.port || '9002';
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND?.trim() || (devPort === '9002'
  ? 'npm run dev'
  : `npm exec -- next dev --turbopack -p ${devPort}`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'laptop-wide',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1586, height: 992 } },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI && process.env.E2E_FORCE_NEW_SERVER !== '1',
    timeout: 120_000,
  },
});
