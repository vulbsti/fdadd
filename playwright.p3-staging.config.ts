import { defineConfig, devices } from '@playwright/test';

const approvedRef = 'wtloawiwntyjiidjbmuk';
const approvedPreviewHost = 'fdadd-git-feature-redesignv2-vulbstis-projects.vercel.app';
const productionAliases = new Set(['aidoraa.com', 'www.aidoraa.com', 'fdadd.vercel.app']);

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

if (process.env.P3_REAL_PROVIDER_E2E !== '1' || process.env.P3_STAGING_E2E !== '1') {
  throw new Error('P3 hosted proof requires both P3_REAL_PROVIDER_E2E=1 and P3_STAGING_E2E=1.');
}

const previewURL = process.env.P3_STAGING_PREVIEW_URL?.trim();
const baseURL = process.env.E2E_BASE_URL?.trim();
const ref = process.env.P3_STAGING_SUPABASE_REF?.trim();
const supabaseURL = process.env.P3_STAGING_SUPABASE_URL?.trim();
const stagingIp = process.env.P3_STAGING_SUPABASE_IP?.trim();
const secret = process.env.P3_STAGING_SUPABASE_SECRET_KEY?.trim();
const publishable = process.env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY?.trim();
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const cronSecret = process.env.P3_STAGING_CRON_SECRET?.trim();

if (!previewURL || !baseURL || !ref || !supabaseURL || !stagingIp || !secret || !publishable || !bypassSecret || !cronSecret) {
  throw new Error('P3 hosted proof needs explicit preview, staging Supabase, DNS pin, API keys, Vercel bypass, and cron recovery settings.');
}

const preview = new URL(previewURL);
const configuredBase = new URL(baseURL);
const supabase = new URL(supabaseURL);

if (ref !== approvedRef) throw new Error('P3 hosted proof refuses an unexpected Supabase project ref.');
if (preview.protocol !== 'https:' || preview.hostname !== approvedPreviewHost
  || preview.pathname !== '/' || preview.search || preview.hash
  || configuredBase.href !== preview.href) {
  throw new Error('P3 hosted proof only permits the exact feature/redesignv2 branch Preview URL.');
}
if (productionAliases.has(preview.hostname)) throw new Error('P3 hosted proof refuses production aliases.');
if (supabase.protocol !== 'https:' || supabase.hostname !== `${approvedRef}.supabase.co`
  || supabase.username || supabase.password || supabase.pathname !== '/' || supabase.search || supabase.hash) {
  throw new Error('P3 hosted proof only permits the explicitly approved Supabase staging project.');
}
if (!isIPv4(stagingIp)) {
  throw new Error('P3 hosted proof requires an explicit IPv4 pin for the staging Supabase host.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'p3-ordinary-chat-learning.spec.ts',
  timeout: 1_200_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: preview.origin,
    launchOptions: {
      args: [`--host-resolver-rules=MAP ${supabase.hostname} ${stagingIp}`],
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
    { name: 'laptop-wide', use: { ...devices['Desktop Chrome'], viewport: { width: 1586, height: 992 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});
