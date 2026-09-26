import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  compareRemoteSchema,
  expectedMigrationVersions,
  parseSupabaseQueryOutput,
  REQUIRED_SCHEMA_OBJECTS,
} from './check-remote-schema.mjs';
import { findMissingEnvironmentKeys } from './assert-vercel-env-keys.mjs';
import { isolatedStagingValues, stagingBuildEnvironment, STAGING_REF } from './configure-isolated-staging-env.mjs';

const versions = ['202609090001', '202609140001', '20260922064955'];

const stagingEnv = {
  P3_STAGING_SUPABASE_REF: STAGING_REF,
  P3_STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  P3_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture',
  P3_STAGING_SUPABASE_SECRET_KEY: 'sb_secret_synthetic_fixture',
  P3_STAGING_CRON_SECRET: 'synthetic-recovery-secret',
};

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
