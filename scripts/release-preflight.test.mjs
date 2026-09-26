import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  compareRemoteSchema,
  expectedMigrationVersions,
  parseSupabaseQueryOutput,
  REQUIRED_SCHEMA_OBJECTS,
} from './check-remote-schema.mjs';
import { findMissingEnvironmentKeys } from './assert-vercel-env-keys.mjs';
import { isolatedStagingValues, stagingBuildEnvironment, STAGING_REF, deploymentURL } from './configure-isolated-staging-env.mjs';
import { inspectPrebuiltFunctions } from './check-prebuilt-functions.mjs';

function withArtifact(run) {
  const root = mkdtempSync(join(tmpdir(), 'aidoraa-prebuilt-test-'));
  const functions = join(root, 'functions');
  const fn = join(functions, 'page.func');
  mkdirSync(fn, { recursive: true });
  try { run({ root, functions, fn }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('prebuilt guard accepts normal functions and deduplicated directory links', () => {
  withArtifact(({ functions, fn }) => {
    writeFileSync(join(fn, 'index.js'), '');
    symlinkSync('page.func', join(functions, 'alias.func'));
    assert.deepEqual(inspectPrebuiltFunctions(functions), { functionCount: 1, issues: [] });
  });
});

test('prebuilt guard rejects templates and real dotenv files, even behind a renamed link', () => {
  for (const name of ['.env.example', '.env', '.env.local', '.env.production']) {
    withArtifact(({ root, functions, fn }) => {
      writeFileSync(join(fn, name), '');
      assert.match(inspectPrebuiltFunctions(functions).issues.join('\n'), /Environment file/);
      rmSync(join(fn, name));
      writeFileSync(join(root, name), '');
      symlinkSync(join(root, name), join(fn, 'renamed-config'));
      assert.match(inspectPrebuiltFunctions(functions).issues.join('\n'), /points to an environment file/);
    });
  }
});

test('prebuilt guard rejects dangling links and absent build output', () => {
  withArtifact(({ root, functions, fn }) => {
    symlinkSync('missing.js', join(fn, 'index.js'));
    assert.match(inspectPrebuiltFunctions(functions).issues.join('\n'), /Missing or unreadable/);
    assert.match(inspectPrebuiltFunctions(join(root, 'absent')).issues.join('\n'), /No prebuilt functions/);
  });
});

test('prebuilt guard checks external filePathMap references, not only physical function files', () => {
  withArtifact(({ root, functions, fn }) => {
    const config = join(fn, '.vc-config.json');
    writeFileSync(join(root, '.env.example'), 'CRON_SECRET=');
    writeFileSync(config, JSON.stringify({ filePathMap: { '.env.example': '.env.example' } }));
    assert.deepEqual(inspectPrebuiltFunctions(functions, root).issues, []);
    rmSync(join(root, '.env.example'));
    assert.match(inspectPrebuiltFunctions(functions, root).issues.join('\n'), /Missing filePathMap source/);
    writeFileSync(config, JSON.stringify({ filePathMap: { 'config': '.env.local' } }));
    assert.match(inspectPrebuiltFunctions(functions, root).issues.join('\n'), /Environment file in filePathMap/);
    writeFileSync(join(root, '.env.local'), '');
    symlinkSync('.env.local', join(root, '.env.example'));
    writeFileSync(config, JSON.stringify({ filePathMap: { '.env.example': '.env.example' } }));
    assert.match(inspectPrebuiltFunctions(functions, root).issues.join('\n'), /points to an environment file/);
  });
});

test('deployment ignore blocks dotenv files but permits only the checked-in example', () => {
  const rules = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8')
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.ok(rules.includes('.env*'));
  assert.ok(rules.indexOf('!.env.example') > rules.indexOf('.env*'));
  assert.deepEqual(rules.filter((line) => line.startsWith('!')), ['!.env.example']);
});

const versions = ['202609090001', '202609140001', '20260922064955'];

const stagingEnv = {
  P3_STAGING_SUPABASE_REF: STAGING_REF,
  P3_STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  P3_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture',
  P3_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_synthetic_fixture',
  P3_STAGING_CRON_SECRET: 'synthetic-recovery-secret',
};

test('Preview URL parsing supports CLI agent JSON and rejects ambiguous or production output', () => {
  const url = 'https://fdadd-fixture-vulbstis-projects.vercel.app';
  assert.equal(deploymentURL(url), url);
  assert.equal(deploymentURL(JSON.stringify({ url, status: 'ok' })), url);
  assert.equal(deploymentURL(JSON.stringify({ url: url.replace('https://', '') })), url);
  assert.throws(() => deploymentURL('https://www.aidoraa.com'));
  assert.throws(() => deploymentURL(`${url}\nhttps://fdadd-other-vulbstis-projects.vercel.app`));
});

test('isolated test build and runtime refuse production or masked server credentials', () => {
  assert.throws(() => isolatedStagingValues({ ...stagingEnv, P3_STAGING_SUPABASE_REF: 'ezanfqbewuqttatrkvhf' }));
  assert.throws(() => isolatedStagingValues({ ...stagingEnv, P3_STAGING_SUPABASE_URL: 'https://ezanfqbewuqttatrkvhf.supabase.co' }));
  assert.throws(() => isolatedStagingValues({ ...stagingEnv, P3_STAGING_SUPABASE_SECRET_KEY: '__REDACTED__' }));
  assert.throws(() => isolatedStagingValues({ ...stagingEnv, P3_STAGING_CRON_SECRET: '' }));
});

test('test-only build replaces all shared database defaults and preserves unrelated settings', () => {
  const contents = 'NEXT_PUBLIC_SUPABASE_URL="https://ezanfqbewuqttatrkvhf.supabase.co"\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="shared-key"\nSUPABASE_SECRET_KEY="__REDACTED__"\nCRON_SECRET="__REDACTED__"\nASTROLOGER_MODEL="provider/model"\n';
  const output = stagingBuildEnvironment(contents, stagingEnv);
  assert.ok(!output.includes('ezanfqbewuqttatrkvhf'));
  assert.ok(!output.includes('__REDACTED__'));
  assert.ok(output.includes('ASTROLOGER_MODEL="provider/model"'));
  for (const [key, value] of Object.entries(isolatedStagingValues(stagingEnv))) {
    assert.equal(output.split('\n').filter((line) => line.startsWith(`${key}=`)).length, 1);
    assert.ok(output.includes(`${key}="${value}"`));
  }
});

test('accepts the two verified historical ledger aliases and required objects', () => {
  const output = [
    'MIGRATION|20260915101436',
    'MIGRATION|20260915101444',
    'MIGRATION|20260922064955',
    ...REQUIRED_SCHEMA_OBJECTS,
  ].join('\n');
  assert.deepEqual(compareRemoteSchema(versions, output), {
    missingMigrations: [],
    unknownMigrations: [],
    missingSchemaObjects: [],
    duplicates: [],
  });
});

test('rejects a missing migration, an unknown remote migration, and missing RPC objects', () => {
  const output = [
    'MIGRATION|202609090001',
    'MIGRATION|202609140001',
    'MIGRATION|20990101000000',
  ].join('\n');
  assert.deepEqual(compareRemoteSchema(versions, output), {
    missingMigrations: ['20260922064955'],
    unknownMigrations: ['20990101000000'],
    missingSchemaObjects: [...REQUIRED_SCHEMA_OBJECTS],
    duplicates: [],
  });
});

test('rejects an alias and canonical timestamp recorded together', () => {
  const output = [
    'MIGRATION|202609090001',
    'MIGRATION|20260915101436',
    'MIGRATION|202609140001',
    'MIGRATION|20260915101444',
    'MIGRATION|20260922064955',
    ...REQUIRED_SCHEMA_OBJECTS,
  ].join('\n');
  assert.deepEqual(compareRemoteSchema(versions, output).duplicates, ['202609090001', '202609140001']);
});

test('parses Supabase CLI JSON output after its connection preamble', () => {
  const output = [
    'Connecting to remote project...\n',
    JSON.stringify({ rows: [{ result: 'MIGRATION|202609090001' }, { result: 'TABLE|public.person_model_revisions' }] }),
    '\nSupabase CLI update notice',
  ].join('');
  assert.equal(parseSupabaseQueryOutput(output), 'MIGRATION|202609090001\nTABLE|public.person_model_revisions');
});

test('requires a non-empty Vercel recovery secret without exposing its value', () => {
  assert.deepEqual(findMissingEnvironmentKeys('CRON_SECRET="not-empty"\nNEXT_PUBLIC_APP_URL=https://example.invalid', ['CRON_SECRET']), []);
  assert.deepEqual(findMissingEnvironmentKeys('CRON_SECRET=""\n', ['CRON_SECRET']), ['CRON_SECRET']);
  assert.deepEqual(findMissingEnvironmentKeys('NEXT_PUBLIC_APP_URL=https://example.invalid', ['CRON_SECRET']), ['CRON_SECRET']);
});

test('includes 12-digit migrations and keeps the SQL contract aligned with its required objects', () => {
  const expected = expectedMigrationVersions();
  assert.ok(expected.includes('202609090001'));
  assert.ok(expected.includes('202609140001'));
  const sql = readFileSync(new URL('./remote-schema-contract.sql', import.meta.url), 'utf8');
  for (const object of REQUIRED_SCHEMA_OBJECTS) {
    assert.ok(sql.includes(object.split('|')[1]), `SQL contract is missing ${object}`);
  }
});
