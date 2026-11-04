import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/about', destination: '/mission', permanent: true }];
  },
  // Browsers call Supabase through /sb on our own domain (see
  // SUPABASE_PROXY_PATH): some ISPs' DNS blocks *.supabase.co.
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
    return supabaseUrl ? [{ source: '/sb/:path*', destination: `${supabaseUrl}/:path*` }] : [];
  },
  output: 'standalone',
  // Atros is loaded with fs.readdir at runtime, so Next's static tracer cannot
  // discover the vendored Python package without an explicit include.
  outputFileTracingIncludes: {
    '/*': ['./vendor/atros/**/*', './runtime/pi/*.mjs', './runtime/pi/*.md', './runtime/pi/package*.json', './runtime/pi/skills/**/*'],
  },
  outputFileTracingExcludes: {
    '/*': ['./.env*', './.vercel/.env*', './runtime/pi/node_modules/**/*'],
  },
};

export default withWorkflow(nextConfig);
