// Local operator helper. Credentials remain in process memory except a temporary,
// private recovery secret needed across the deploy and browser-test commands.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { configureStagingBuild, deployStagingCandidate } from './configure-isolated-staging-env.mjs';

const project = 'prj_T6xLcx3lfm7KjpLk4co1lCgkSMnK';
const team = 'team_t689qVHC6ycaHamXLceV4yu5';
const ref = 'wtloawiwntyjiidjbmuk';
const stateFile = '.vercel/system-proof-secret.json';
let phase = 'prepare';
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
      ...(process.env.ASTROLOGER_RUNTIME === 'pi' ? {
        VERCEL_AUTOMATION_BYPASS_SECRET: Object.keys(api(`/v9/projects/${project}`).protectionBypass ?? {})[0],
      } : {}),
    };
    execFileSync('vercel', ['pull', '--yes', '--environment=preview'], { stdio: ['ignore', 'pipe', 'pipe'] });
    configureStagingBuild(env);
    // Next/Vercel may add local dotenv files to the final function map even
    // when excluded from NFT tracing. Build a clean working-tree copy instead
    // of moving the operator's files or ever allowing them into upload inputs.
    const candidate = mkdtempSync(join(tmpdir(), 'aidoraa-staging-build-'));
    try {
      const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
      for (const file of files) {
        if (file.split('/').some((part) => part.startsWith('.env') && part !== '.env.example')) continue;
        const target = join(candidate, file);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file, target);
      }
      mkdirSync(join(candidate, '.vercel'));
      for (const file of ['project.json', '.env.preview.local']) copyFileSync(`.vercel/${file}`, join(candidate, '.vercel', file));
      console.log('Building clean isolated test candidate…');
      phase = 'clean dependency install';
      execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: candidate, stdio: ['ignore', 'pipe', 'pipe'] });
      phase = 'clean vercel build';
      try {
        execFileSync('vercel', ['build', '--yes'], { cwd: candidate, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        // Diagnostic artifact is private/local, never included in deployment.
        writeFileSync('.vercel/pi-build-error.log', String(error.stdout ?? '') + String(error.stderr ?? ''), { mode: 0o600 });
        throw new Error('Build failed; private diagnostic saved in .vercel/pi-build-error.log');
      }
      phase = 'isolated deployment';
      console.log(deployStagingCandidate(env, candidate));
    } finally {
      rmSync(candidate, { recursive: true, force: true });
    }
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
} catch (error) {
  // Do not print CLI exceptions: they can embed credential-bearing stdin/args.
  console.error(`Staging helper failed during ${phase}. Check CLI access, build diagnostics, and isolated Preview configuration.`);
  if (phase === 'isolated deployment') console.error(error.message);
  process.exitCode = 1;
}
