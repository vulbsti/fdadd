// Reproduce the legacy-to-current migration batch in a disposable database in
// the repo's local Supabase Postgres container. This never uses a linked DB.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const container = 'supabase_db_aidoraa';
const projectLabel = 'aidoraa';
const repoRoot = resolve(import.meta.dirname, '..');
const prefix = 'aidoraa_upgrade_txn_repro_';
const database = `${prefix}${randomUUID().replaceAll('-', '')}`;
const userId = 'f1000000-0000-4000-8000-000000000001';
const profileId = 'f1000000-0000-4000-8000-000000000011';

if (process.env.AIDORAA_LOCAL_UPGRADE_REPRO !== '1') {
  throw new Error('Refusing to run without AIDORAA_LOCAL_UPGRADE_REPRO=1.');
}
if (process.env.P3_PRODUCTION_SMOKE === '1' || process.env.P3_STAGING_E2E === '1') {
  throw new Error('Local upgrade repro refuses production or staging mode.');
}
if (!/^aidoraa_upgrade_txn_repro_[0-9a-f]{32}$/.test(database)) {
  throw new Error('Generated temporary database name failed its safety check.');
}

function dockerExec(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
}

function psql(dbName, sql, args = []) {
  return dockerExec([
    'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', dbName, ...args,
  ], { input: sql });
}

function query(dbName, sql) {
  return psql(dbName, sql, ['-A', '-t']).trim();
}

const foundProject = dockerExec([
  'inspect', '--format', '{{ index .Config.Labels "com.supabase.cli.project" }}', container,
]).trim();
if (foundProject !== projectLabel) {
  throw new Error(`Refusing container ${container}: expected local Supabase project label ${projectLabel}.`);
}

const requiredRoles = query('postgres', `
  select count(*) from pg_roles where rolname in ('anon','authenticated','service_role');
`);
if (requiredRoles !== '3') throw new Error('Local Supabase database is missing expected API roles.');

const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((file) => /^\d{12,14}_.+\.sql$/.test(file))
  .sort()
  .map((file) => ({ file, sql: readFileSync(join(migrationsDir, file), 'utf8') }));
const firstThree = [
  '202608230001_auth_and_payments.sql',
  '202609090001_astrologer.sql',
  '202609140001_astrologer_agent_memory.sql',
];
if (migrations.length <= firstThree.length
  || firstThree.some((file, index) => migrations[index]?.file !== file)) {
  throw new Error('Migration ordering changed; review this isolated upgrade fixture before running.');
}
const legacy = migrations.slice(0, firstThree.length);
const upgradeSql = migrations.slice(firstThree.length).map(({ sql }) => sql).join('\n\n');

let created = false;
try {
  dockerExec([
    'exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
    '-c', `CREATE DATABASE "${database}"`,
  ]);
  created = true;

  psql(database, `
    create schema auth;
    create schema extensions;
    create schema storage;
    -- Genuine subset of the local Supabase Storage bucket contract needed by
    -- application migrations: text PK, non-null unique name, nullable public
    -- flag with a private default. This is not a Storage service/RLS substitute;
    -- real Storage behavior remains covered by the local Supabase DB tests.
    create table storage.buckets (
      id text primary key,
      name text not null unique,
      public boolean default false
    );
    alter table storage.buckets enable row level security;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid
      language sql stable set search_path = ''
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  for (const migration of legacy) {
    psql(database, `begin;\n${migration.sql}\ncommit;`);
  }

  psql(database, `
    insert into auth.users (id, raw_user_meta_data)
      values ('${userId}', '{"name":"Synthetic migration-retention user"}'::jsonb);
    insert into storage.buckets (id, name, public)
      values ('legacy-retained-bucket', 'legacy-retained-bucket', true);
    insert into public.astro_profiles (
      id, user_id, name, birth_date, birth_time, lat, lng, tz, place_name,
      time_source, time_confidence, chart_json, sensitivity_json, initialization_status
    ) values (
      '${profileId}', '${userId}', 'Synthetic retained profile', '1991-04-12', '06:35',
      12.97, 77.59, 'Asia/Kolkata', 'Bengaluru', 'family', 'approximate',
      '{"chart":"pre-upgrade-chart-marker"}'::jsonb,
      '{"sensitivity":"pre-upgrade-sensitivity-marker"}'::jsonb, 'ready'
    );
  `);

  let expectedRegression = false;
  try {
    psql(database, `\\set VERBOSITY verbose\nbegin;\n${upgradeSql}\ncommit;`);
  } catch (error) {
    const diagnostic = `${error?.stderr ?? ''}\n${error?.stdout ?? ''}`;
    if (!diagnostic.includes('55006')) {
      throw new Error(`Expected pending-trigger 55006 regression, got: ${diagnostic.slice(-3000)}`);
    }
    expectedRegression = true;
  }
  if (!expectedRegression) {
    throw new Error('The regression fixture unexpectedly succeeded without SET CONSTRAINTS ALL IMMEDIATE.');
  }
  const afterRollback = JSON.parse(query(database, `
    select json_build_object(
      'profiles', (select count(*) from public.astro_profiles where id='${profileId}' and user_id='${userId}'),
      'chartsPreserved', (select chart_json->>'chart' = 'pre-upgrade-chart-marker'
        and sensitivity_json->>'sensitivity' = 'pre-upgrade-sensitivity-marker'
        from public.astro_profiles where id='${profileId}' and user_id='${userId}'),
      'headsTableAbsent', to_regclass('public.person_model_heads') is null,
      'piBucketAbsent', not exists (select 1 from storage.buckets where id='pi-workspaces'),
      'legacyBucketPreserved', exists (select 1 from storage.buckets
        where id='legacy-retained-bucket' and name='legacy-retained-bucket' and public=true)
    )::text;
  `));
  if (afterRollback.profiles !== 1 || afterRollback.chartsPreserved !== true || afterRollback.headsTableAbsent !== true
    || afterRollback.piBucketAbsent !== true || afterRollback.legacyBucketPreserved !== true) {
    throw new Error(`Failed regression transaction did not fully roll back: ${JSON.stringify(afterRollback)}`);
  }

  psql(database, `\\set VERBOSITY verbose\nbegin;\nset constraints all immediate;\n${upgradeSql}\ncommit;`);
  const receipt = JSON.parse(query(database, `
    select json_build_object(
      'profiles', (select count(*) from public.astro_profiles where id='${profileId}' and user_id='${userId}'
        and name='Synthetic retained profile'),
      'chart', (select chart_json->>'chart' from public.astro_profiles where id='${profileId}' and user_id='${userId}'),
      'sensitivity', (select sensitivity_json->>'sensitivity' from public.astro_profiles where id='${profileId}' and user_id='${userId}'),
      'initializationStatus', (select initialization_status from public.astro_profiles where id='${profileId}' and user_id='${userId}'),
      'headAndRevision', (select count(*) from public.person_model_heads h
        join public.person_model_revisions r using (profile_id, user_id)
        where h.profile_id='${profileId}' and h.user_id='${userId}'
          and h.current_revision=r.revision_no),
      'preferences', (select count(*) from public.person_preferences where profile_id='${profileId}' and user_id='${userId}'),
      'sourceSequence', (select count(*) from public.person_source_sequences where profile_id='${profileId}' and user_id='${userId}'),
      'privatePiBucket', exists (select 1 from storage.buckets
        where id='pi-workspaces' and name='pi-workspaces' and public=false),
      'legacyBucketPreserved', exists (select 1 from storage.buckets
        where id='legacy-retained-bucket' and name='legacy-retained-bucket' and public=true),
      'requiredTablesPresent', (to_regclass('public.person_model_heads') is not null
        and to_regclass('public.person_model_revisions') is not null
        and to_regclass('public.person_source_items') is not null
        and to_regclass('public.person_outbox') is not null
        and to_regclass('public.person_jobs') is not null
        and to_regclass('public.pi_workspace_checkpoints') is not null)
    )::text;
  `));
  if (receipt.profiles !== 1
    || receipt.chart !== 'pre-upgrade-chart-marker'
    || receipt.sensitivity !== 'pre-upgrade-sensitivity-marker'
    || receipt.initializationStatus !== 'ready'
    || receipt.headAndRevision !== 1
    || receipt.preferences !== 1
    || receipt.sourceSequence !== 1
    || receipt.privatePiBucket !== true
    || receipt.legacyBucketPreserved !== true
    || receipt.requiredTablesPresent !== true) {
    throw new Error(`Upgrade transaction did not preserve/backfill expected state: ${JSON.stringify(receipt)}`);
  }

  console.log(JSON.stringify({
    mode: 'isolated local Supabase Postgres only',
    database,
    baselineMigrations: legacy.map(({ file }) => file),
    transactionalMigrations: migrations.slice(firstThree.length).map(({ file }) => file),
    regressionReproduced: 'SQLSTATE 55006 without SET CONSTRAINTS ALL IMMEDIATE',
    correctedUpgrade: 'committed with SET CONSTRAINTS ALL IMMEDIATE at transaction start',
    receipt,
  }, null, 2));
} finally {
  if (created) {
    dockerExec([
      'exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
      '-c', `DROP DATABASE "${database}" WITH (FORCE)`,
    ]);
  }
}
