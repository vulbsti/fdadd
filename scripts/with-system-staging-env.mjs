// Local operator helper. Credentials remain in process memory except a temporary,
// private recovery secret needed across the deploy and browser-test commands.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { configureStagingBuild, deployStagingCandidate } from './configure-isolated-staging-env.mjs';

const project = 'prj_T6xLcx3lfm7KjpLk4co1lCgkSMnK';
const team = 'team_t689qVHC6ycaHamXLceV4yu5';
const ref = 'wtloawiwntyjiidjbmuk';
const stateFile = '.vercel/system-proof-secret.json';
function api(path, method = 'GET', body) {
  const args = ['api', `${path}${path.includes('?') ? '&' : '?'}teamId=${team}`, '--method', method];
  if (body) args.push('--input', '-');
  return JSON.parse(execFileSync('vercel', args, {
    input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }));
}

try {
  if (process.argv[2] === '--prepare-cron') {
    const secret = randomBytes(32).toString('hex');
    mkdirSync('.vercel', { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ secret }), { mode: 0o600 });
    console.log('Test-only recovery secret prepared. Run --deploy to create the isolated test candidate.');
  } else if (process.argv[2] === '--deploy') {
    const { secret } = JSON.parse(readFileSync(stateFile, 'utf8'));
    const keys = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const env = {
      ...process.env,
      P3_STAGING_SUPABASE_REF: ref,
      P3_STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
      P3_STAGING_SUPABASE_SECRET_KEY: keys.find((entry) => entry.type === 'secret')?.api_key,
      P3_STAGING_SUPABASE_PUBLISHABLE_KEY: keys.find((entry) => entry.type === 'publishable')?.api_key,
      P3_STAGING_CRON_SECRET: secret,
    };
    execFileSync('vercel', ['pull', '--yes', '--environment=preview'], { stdio: ['ignore', 'pipe', 'pipe'] });
    configureStagingBuild(env);
    console.log('Building isolated test candidate…');
    execFileSync('vercel', ['build', '--yes'], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(deployStagingCandidate(env));
  } else {
    const [url, ...command] = process.argv.slice(2);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^fdadd-[a-z0-9-]+-vulbstis-projects\.vercel\.app$/.test(parsed.hostname)
      || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password || !command.length) {
      throw new Error('Usage: node scripts/with-system-staging-env.mjs <isolated-fdadd-preview-url> <command> [args...]');
    }
    const { secret } = JSON.parse(readFileSync(stateFile, 'utf8'));
    const keys = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const publishable = keys.find((entry) => entry.type === 'publishable')?.api_key;
    const admin = keys.find((entry) => entry.type === 'secret')?.api_key;
    const metadata = api(`/v9/projects/${project}`);
    const bypass = Object.keys(metadata.protectionBypass ?? {})[0];
    if (!publishable || !admin || !bypass || !secret) throw new Error('Staging keys or automation bypass are unavailable.');
    const dns = JSON.parse(execFileSync('curl', ['--fail', '--silent', `https://dns.google/resolve?name=${ref}.supabase.co&type=A`], { encoding: 'utf8' }));
    const ip = dns.Answer?.find((entry) => entry.type === 1)?.data;
    if (!ip) throw new Error('Could not resolve the staging database endpoint.');
    const child = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env: {
      ...process.env, P3_REAL_PROVIDER_E2E: '1', P3_STAGING_E2E: '1',
      E2E_BASE_URL: parsed.origin, P3_STAGING_PREVIEW_URL: parsed.origin,
      P3_STAGING_APPROVED_HOST: parsed.hostname,
      P3_STAGING_SUPABASE_REF: ref, P3_STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
      P3_STAGING_SUPABASE_IP: ip, P3_STAGING_SUPABASE_SECRET_KEY: admin,
      P3_STAGING_SUPABASE_PUBLISHABLE_KEY: publishable, P3_STAGING_CRON_SECRET: secret,
      VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
    } });
    process.exitCode = child.status ?? 1;
  }
} catch {
  // Do not print CLI exceptions: they can embed credential-bearing stdin/args.
  console.error('Staging helper failed. Check CLI access, the isolated Preview URL, and whether --prepare-cron and --deploy were run.');
  process.exitCode = 1;
}
