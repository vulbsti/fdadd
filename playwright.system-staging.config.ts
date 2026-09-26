import { defineConfig, devices } from '@playwright/test';

const stagingRef = 'wtloawiwntyjiidjbmuk';
const approvedPreviewHost = process.env.P3_STAGING_APPROVED_HOST?.trim();
const productionAliases = new Set(['aidoraa.com', 'www.aidoraa.com', 'fdadd.vercel.app']);
const baseURL = process.env.E2E_BASE_URL?.trim();
const previewURL = process.env.P3_STAGING_PREVIEW_URL?.trim();
const ref = process.env.P3_STAGING_SUPABASE_REF?.trim();
const supabaseURL = process.env.P3_STAGING_SUPABASE_URL?.trim();
const supabaseIp = process.env.P3_STAGING_SUPABASE_IP?.trim();
const secret = process.env.P3_STAGING_SUPABASE_SECRET_KEY?.trim();
const publishable = process.env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY?.trim();
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

if (process.env.P3_REAL_PROVIDER_E2E !== '1' || process.env.P3_STAGING_E2E !== '1') {
  throw new Error('Hosted system proof requires P3_REAL_PROVIDER_E2E=1 and P3_STAGING_E2E=1.');
}
if (!baseURL || !previewURL || !approvedPreviewHost || !ref || !supabaseURL || !supabaseIp || !secret || !publishable || !bypass) {
  throw new Error('Hosted system proof needs the exact approved Preview URL and host, staging Supabase keys/IP, and Vercel bypass.');
}
const base = new URL(baseURL);
const preview = new URL(previewURL);
const supabase = new URL(supabaseURL);
if (ref !== stagingRef || supabase.protocol !== 'https:' || supabase.hostname !== `${stagingRef}.supabase.co`
  || supabase.username || supabase.password || supabase.pathname !== '/' || supabase.search || supabase.hash) {
  throw new Error('Hosted system proof refuses a Supabase target outside the approved staging project.');
}
if (base.href !== preview.href || preview.protocol !== 'https:' || preview.hostname !== approvedPreviewHost
  || preview.pathname !== '/' || preview.search || preview.hash || productionAliases.has(preview.hostname)) {
  throw new Error('Hosted system proof refuses any browser target other than the explicitly approved immutable staging deployment URL.');
}
if (!preview.hostname.endsWith('-vulbstis-projects.vercel.app')) {
  throw new Error('Hosted system proof requires an owner-scoped Vercel Preview deployment host.');
}
if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(supabaseIp)) {
  throw new Error('Hosted system proof needs a valid IPv4 pin for the staging Supabase project.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'system-pipeline.spec.ts',
  outputDir: 'test-results/system-pipeline-staging',
  timeout: 1_800_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: preview.origin,
    launchOptions: { args: [`--host-resolver-rules=MAP ${supabase.hostname} ${supabaseIp}`] },
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'system-pipeline', use: { ...devices['Desktop Chrome'], viewport: { width: 1586, height: 992 } } }],
});
