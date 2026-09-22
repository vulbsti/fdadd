import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  /* config options here */
  // A second local E2E server needs an isolated Next lock/build directory.
  // Keep the production/default artifact at `.next`.
  distDir: process.env.NEXT_DIST_DIR === '.next-recovery' ? '.next-recovery' : '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone', // Recommended for Vercel and similar environments
  // Atros is loaded with fs.readdir at runtime, so Next's static tracer cannot
  // discover the vendored Python package without an explicit include.
  outputFileTracingIncludes: {
    '/*': ['./vendor/atros/**/*'],
  },
};

export default withWorkflow(nextConfig);
