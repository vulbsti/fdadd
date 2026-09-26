import { defineConfig } from '@playwright/test';
import staging from './playwright.system-staging.config';

// Importing the system config executes its immutable Preview/staging guards.
export default defineConfig({
  ...staging,
  testMatch: 'pi-workspace.spec.ts',
  outputDir: 'test-results/pi-workspace-staging',
  timeout: 2_700_000,
  workers: 1,
  projects: [{ name: 'pi-workspace-staging', use: staging.projects?.[0]?.use }],
});
