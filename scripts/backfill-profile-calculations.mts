// Operator tool: compute the stored calculation set for existing profiles, and
// replace rows made by an older Atros engine.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… VERCEL_OIDC_TOKEN=… \
//     npx tsx scripts/backfill-profile-calculations.mts [--dry-run]
//
// Needs Vercel Sandbox credentials for the shared Atros sandbox. Each profile
// is recomputed for its current birth revision; rows from an older engine
// version are replaced.
import { createClient } from '@supabase/supabase-js';
import { ATROS_ENGINE_VERSION } from '../src/lib/astro/atros-commands';
import { recomputeProfileCalculations } from '../src/lib/astro/profile-calculations';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');
const dryRun = process.argv.includes('--dry-run');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const profiles = await admin.from('astro_profiles').select('id,user_id,birth_revision')
  .not('birth_date', 'is', null).not('birth_time', 'is', null).not('lat', 'is', null).not('lng', 'is', null).not('tz', 'is', null);
if (profiles.error) throw new Error(`Profile list failed: ${profiles.error.message}`);
const done = await admin.from('astro_profile_calculations').select('profile_id,birth_revision,engine_version');
if (done.error) throw new Error(`Calculation list failed: ${done.error.message}`);
const current = new Set((done.data ?? []).filter((row) => row.engine_version === ATROS_ENGINE_VERSION)
  .map((row) => `${row.profile_id}:${row.birth_revision}`));

const todo = (profiles.data ?? []).filter((row) => !current.has(`${row.id}:${row.birth_revision ?? 0}`));
console.log(JSON.stringify({ profiles: profiles.data?.length ?? 0, todo: todo.length, engine: ATROS_ENGINE_VERSION, dryRun }));
let failed = 0;
for (const profile of todo) {
  if (dryRun) continue;
  try {
    const result = await recomputeProfileCalculations(admin, profile.id, profile.user_id);
    console.log(JSON.stringify({ profile: profile.id, ...result }));
  } catch (error) {
    failed++;
    console.error(JSON.stringify({ profile: profile.id, error: error instanceof Error ? error.message : 'unknown' }));
  }
}
process.exitCode = failed ? 1 : 0;
