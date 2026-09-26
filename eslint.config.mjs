import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.next-recovery/**',
    '.next-system-proof/**',
    '.next-p2-visual/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/app/.well-known/workflow/v1/**',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
