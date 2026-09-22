import { defineConfig, devices } from '@playwright/test';

if (process.env.P1_STAGING_E2E !== '1') {
  throw new Error('Hosted P1 proof requires P1_STAGING_E2E=1.');
}

const baseURL = process.env.E2E_BASE_URL?.trim();
const expectedPreviewHost = process.env.P1_STAGING_PREVIEW_HOST?.trim();
const stagingSupabaseRef = process.env.P1_STAGING_SUPABASE_REF?.trim();
const stagingSupabaseUrl = process.env.P1_STAGING_SUPABASE_URL?.trim();
const stagingSupabaseIp = process.env.P1_STAGING_SUPABASE_IP?.trim();
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

if (
  !baseURL || !expectedPreviewHost || !stagingSupabaseRef || !stagingSupabaseUrl
  || !stagingSupabaseIp || !bypassSecret
) {
  throw new Error('Hosted P1 proof is missing its explicit preview, staging Supabase, or Vercel bypass guard.');
}

const preview = new URL(baseURL);
const supabase = new URL(stagingSupabaseUrl);
if (preview.protocol !== 'https:' || preview.hostname !== expectedPreviewHost) {
  throw new Error(`Hosted P1 proof refuses unexpected preview target: ${preview.hostname}`);
}
if (!preview.hostname.endsWith('-vulbstis-projects.vercel.app')) {
  throw new Error(`Hosted P1 proof refuses non-preview Vercel host: ${preview.hostname}`);
}
if (['aidoraa.com', 'www.aidoraa.com', 'fdadd.vercel.app'].includes(preview.hostname)) {
  throw new Error(`Hosted P1 proof refuses production alias: ${preview.hostname}`);
}
if (['ezanfqbewuqttatrkvhf', 'svekonjfpqlusrwmmafg'].includes(stagingSupabaseRef)) {
  throw new Error(`Hosted P1 proof refuses production or retired Supabase ref: ${stagingSupabaseRef}`);
}
if (supabase.protocol !== 'https:' || supabase.hostname !== `${stagingSupabaseRef}.supabase.co`) {
  throw new Error(`Hosted P1 proof refuses mismatched Supabase target: ${supabase.hostname}`);
}
if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(stagingSupabaseIp)) {
  throw new Error('Hosted P1 proof requires an explicit IPv4 address for its staging-only DNS override.');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    launchOptions: {
      args: [`--host-resolver-rules=MAP ${supabase.hostname} ${stagingSupabaseIp}`],
    },
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    },
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
});
