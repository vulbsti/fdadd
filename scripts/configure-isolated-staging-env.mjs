import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const STAGING_REF = 'wtloawiwntyjiidjbmuk';

export function isolatedStagingValues(env) {
  if (env.P3_STAGING_SUPABASE_REF !== STAGING_REF
    || env.P3_STAGING_SUPABASE_URL !== `https://${STAGING_REF}.supabase.co`) {
    throw new Error('Automated system tests require the isolated staging Supabase project.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY ?? '')
    || !/^sb_secret_[A-Za-z0-9_-]+$/.test(env.P3_STAGING_SUPABASE_SECRET_KEY ?? '')
    || !env.P3_STAGING_CRON_SECRET || /[\r\n]/.test(env.P3_STAGING_CRON_SECRET)) {
    throw new Error('Actual staging API keys and a recovery secret are required; masked Vercel values cannot be used.');
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.P3_STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.P3_STAGING_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: env.P3_STAGING_SUPABASE_SECRET_KEY,
    CRON_SECRET: env.P3_STAGING_CRON_SECRET,
  };
}

export function stagingBuildEnvironment(contents, env) {
  const values = isolatedStagingValues(env);
  const retained = contents.split(/\r?\n/).filter((line) => {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    return !Object.hasOwn(values, key ?? '');
  });
  const quote = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
  return `${retained.join('\n').trimEnd()}\n${Object.entries(values).map(([key, value]) => `${key}=${quote(value)}`).join('\n')}\n`;
}

export function configureStagingBuild(env = process.env) {
  const path = '.vercel/.env.preview.local';
  writeFileSync(path, stagingBuildEnvironment(readFileSync(path, 'utf8'), env), { mode: 0o600 });
}

export function deployStagingCandidate(env = process.env) {
  const values = isolatedStagingValues(env);
  const args = ['--yes', 'vercel@latest', 'deploy', '--prebuilt', '--yes'];
  if (env.VERCEL_TOKEN) args.push('--token', env.VERCEL_TOKEN);
  if (env.GITHUB_SHA) args.push('--meta', `codex_commit=${env.GITHUB_SHA}`);
  for (const [key, value] of Object.entries(values)) args.push('--env', `${key}=${value}`);
  let url;
  try {
    url = execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    // CLI exceptions can embed credential-bearing arguments. Never print them.
    throw new Error('Isolated staging deployment failed; check Vercel access and the prebuilt candidate.');
  }
  if (!/^https:\/\/fdadd-[a-z0-9-]+-vulbstis-projects\.vercel\.app\/?$/.test(url)) {
    throw new Error('Vercel did not return an owner-scoped immutable Preview URL.');
  }
  return url.replace(/\/$/, '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--deploy') console.log(deployStagingCandidate());
    else {
      configureStagingBuild();
      console.log('Configured the isolated test database for this build only.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Isolated staging configuration failed.');
    process.exitCode = 1;
  }
}
