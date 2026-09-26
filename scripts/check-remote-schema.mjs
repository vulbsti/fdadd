import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT_REF = 'ezanfqbewuqttatrkvhf';

// These two historical production ledger versions refer to migrations whose
// contents were confirmed byte-equivalent to the current files on 2026-09-26.
// Keep this allowlist exact; every other remote-only migration fails closed.
export const MIGRATION_VERSION_ALIASES = Object.freeze({
  '20260915101436': '202609090001',
  '20260915101444': '202609140001',
});

export const REQUIRED_SCHEMA_OBJECTS = Object.freeze([
  'TABLE|public.person_model_revisions',
  'TABLE|public.person_objects',
  'TABLE|public.person_observations',
  'TABLE|public.person_jobs',
  'TABLE|public.person_birth_revisions',
  'AUTH_FUNCTION|public.person_create(text,uuid)',
  'AUTH_FUNCTION|public.person_accept_user_message(uuid,uuid,uuid)',
  'AUTH_FUNCTION|public.person_record_correction(uuid,uuid,uuid,uuid)',
  'WORKER_FUNCTION|public.person_claim_job(uuid,integer)',
  'WORKER_FUNCTION|public.person_claim_outbox(integer)',
  'WORKER_FUNCTION|public.person_publish_revision(uuid,uuid,bigint,bigint,bigint,uuid,jsonb)',
  'AUTH_FUNCTION|public.begin_person_birth_setup(uuid,jsonb,uuid)',
]);

export function compareRemoteSchema(expectedVersions, output) {
  const expected = new Set(expectedVersions);
  const found = new Set();
  const duplicateVersions = new Set();
  const objects = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('MIGRATION|')) {
      const reportedVersion = line.slice('MIGRATION|'.length);
      const version = MIGRATION_VERSION_ALIASES[reportedVersion] ?? reportedVersion;
      if (found.has(version)) duplicateVersions.add(version);
      found.add(version);
    } else {
      objects.add(line);
    }
  }

  const missingMigrations = [...expected].filter((version) => !found.has(version)).sort();
  const unknownMigrations = [...found].filter((version) => !expected.has(version)).sort();
  const missingSchemaObjects = REQUIRED_SCHEMA_OBJECTS.filter((object) => !objects.has(object));
  const duplicates = [...duplicateVersions].sort();

  return { missingMigrations, unknownMigrations, missingSchemaObjects, duplicates };
}

export function parseSupabaseQueryOutput(output) {
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) throw new Error('Supabase CLI returned no JSON query result.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEnd = -1;
  for (let index = jsonStart; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      jsonEnd = index + 1;
      break;
    }
  }
  if (jsonEnd < 0) throw new Error('Supabase CLI returned an incomplete JSON query result.');
  let payload;
  try {
    payload = JSON.parse(output.slice(jsonStart, jsonEnd));
  } catch {
    throw new Error('Supabase CLI returned an invalid JSON query result.');
  }
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error('Supabase CLI query result does not contain rows.');
  }
  const values = payload.rows.map((row) => row?.result);
  if (values.some((value) => typeof value !== 'string')) {
    throw new Error('Supabase CLI query result does not contain the expected schema rows.');
  }
  return values.join('\n');
}

export function expectedMigrationVersions() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return readdirSync(resolve(repoRoot, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, name.indexOf('_')))
    .filter((version) => /^\d{12,14}$/.test(version))
    .sort();
}

function formatVersions(label, versions) {
  return versions.length ? `${label}: ${versions.join(', ')}` : null;
}

export function runSchemaPreflight({ accessToken, expectedVersions, supabaseBin = 'npm' }) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const queryFile = resolve(repoRoot, 'scripts/remote-schema-contract.sql');
  let output;
  try {
    output = execFileSync(supabaseBin, [
      'exec', '--', 'supabase', 'db', 'query',
      '--linked',
      '--project-ref', PRODUCTION_PROJECT_REF,
      '--agent', 'yes',
      '--output-format', 'json',
      '--file', queryFile,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      env: {
        ...process.env,
        ...(accessToken ? { SUPABASE_ACCESS_TOKEN: accessToken } : {}),
      },
    });
  } catch {
    throw new Error('Could not read the production schema migration ledger through the Supabase Management API. Check CLI authentication and target project access.');
  }

  let remoteRows;
  try {
    remoteRows = parseSupabaseQueryOutput(output);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Could not parse the production schema query result.');
  }
  const result = compareRemoteSchema(expectedVersions, remoteRows);
  const issues = [
    formatVersions('Migrations missing from production', result.missingMigrations),
    formatVersions('Unexpected migrations recorded in production', result.unknownMigrations),
    formatVersions('Duplicate canonical migration versions', result.duplicates),
    result.missingSchemaObjects.length
      ? `Required schema objects missing from production: ${result.missingSchemaObjects.join(', ')}`
      : null,
  ].filter(Boolean);
  if (issues.length) throw new Error(issues.join('\n'));
  return result;
}

function main() {
  const expected = expectedMigrationVersions();
  const result = runSchemaPreflight({
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    expectedVersions: expected,
    supabaseBin: process.env.SUPABASE_CLI || 'npm',
  });
  console.log(`Production schema is compatible: ${expected.length} repository migrations and ${REQUIRED_SCHEMA_OBJECTS.length} required objects are present.`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Production schema preflight failed.');
    process.exitCode = 1;
  }
}
