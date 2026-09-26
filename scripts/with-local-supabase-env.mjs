import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('Usage: node scripts/with-local-supabase-env.mjs <command> [args...]');
  process.exit(2);
}

const cli = fileURLToPath(new URL('../node_modules/.bin/supabase', import.meta.url));
const status = spawnSync(cli, ['status', '-o', 'json'], { encoding: 'utf8' });
if (status.status !== 0) {
  console.error('Local Supabase status unavailable. Start the local stack first.');
  process.exit(1);
}

let values;
try {
  values = JSON.parse(status.stdout);
} catch {
  console.error('Local Supabase status was not valid JSON.');
  process.exit(1);
}

const url = new URL(values.API_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
  console.error('Refusing non-local Supabase API URL for disposable tests.');
  process.exit(1);
}
if (!values.PUBLISHABLE_KEY || !values.SECRET_KEY) {
  console.error('Local Supabase publishable/secret keys are unavailable.');
  process.exit(1);
}

// Sandbox OIDC credentials expire. A fresh `vercel pull --environment=preview`
// can supply only this credential without replacing the local database config
// with the remote environment or loading redacted provider secrets.
let sandboxEnv = {};
if (process.env.E2E_VERCEL_ENV_FILE) {
  try {
    const token = parseEnv(readFileSync(process.env.E2E_VERCEL_ENV_FILE, 'utf8')).VERCEL_OIDC_TOKEN;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('expired');
    sandboxEnv = { VERCEL_OIDC_TOKEN: token };
  } catch {
    console.error('Sandbox OIDC credential is missing or expired. Pull fresh Preview settings first.');
    process.exit(1);
  }
}

const child = spawnSync(command[0], command.slice(1), {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...sandboxEnv,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: values.SECRET_KEY,
  },
});
if (child.error) {
  console.error(`Could not start local test command: ${child.error.message}`);
  process.exit(1);
}
process.exit(child.status ?? 1);
