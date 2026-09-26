import { defineConfig, devices } from '@playwright/test';

const productionOrigin = 'https://www.aidoraa.com';
const productionProjectRef = 'ezanfqbewuqttatrkvhf';
const projectHost = `${productionProjectRef}.supabase.co`;

if (process.env.P3_PRODUCTION_SMOKE !== '1') {
  throw new Error('Production smoke is opt-in only; set P3_PRODUCTION_SMOKE=1 after promotion is verified.');
}

const supabaseUrl = process.env.P3_PRODUCTION_SUPABASE_URL?.trim();
const supabaseSecret = process.env.P3_PRODUCTION_SUPABASE_SECRET_KEY?.trim();
const supabasePublishable = process.env.P3_PRODUCTION_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabaseIp = process.env.P3_PRODUCTION_SUPABASE_IP?.trim();

if (!supabaseUrl || !supabaseSecret || !supabasePublishable || !supabaseIp) {
  throw new Error('Production smoke requires the production Supabase URL, secret/publishable keys, and DNS pin.');
}

const target = new URL(supabaseUrl);
const validIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(supabaseIp)
  && supabaseIp.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
if (target.href !== `https://${projectHost}/` || target.username || target.password
  || target.search || target.hash || !validIp) {
  throw new Error('Production smoke refuses any Supabase target outside the pinned Aidoraa production project.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'production-onboarding.spec.ts',
  outputDir: 'test-results/production-smoke-private',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: productionOrigin,
    launchOptions: { args: [`--host-resolver-rules=MAP ${projectHost} ${supabaseIp}`] },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{
    name: 'production-onboarding-smoke',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1586, height: 992 } },
  }],
});
