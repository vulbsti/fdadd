// Explicit operator tool for the two approved environments. Dry-run by default.
// Never replays the two historical production aliases; verifies their SQL first.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MIGRATION_VERSION_ALIASES } from './check-remote-schema.mjs';

const refs = { staging: 'wtloawiwntyjiidjbmuk', production: 'ezanfqbewuqttatrkvhf' };
const target = process.argv[2];
if (!refs[target] || process.argv.slice(3).some((flag) => flag !== '--apply')) {
  throw new Error('Usage: node scripts/apply-compatible-migrations.mjs staging|production [--apply]');
}
const apply = process.argv.includes('--apply');
function query(args) {
  const result = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--project-ref', refs[target], ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(result).rows;
}
const files = readdirSync('supabase/migrations').filter((file) => /^\d{12,14}_.+\.sql$/.test(file)).sort();
const migrations = files.map((file) => ({
  file, version: file.split('_')[0], name: file.replace(/^\d+_/, '').replace(/\.sql$/, ''),
  sql: readFileSync(join('supabase/migrations', file), 'utf8').trim(),
}));
const remote = query(['select version,name,statements from supabase_migrations.schema_migrations order by version']);
const applied = new Set();
for (const row of remote) {
  const version = MIGRATION_VERSION_ALIASES[row.version] ?? row.version;
  const migration = migrations.find((entry) => entry.version === version);
  if (!migration || applied.has(version)) throw new Error(`Unexpected/duplicate migration ${row.version}; refusing to apply.`);
  if (MIGRATION_VERSION_ALIASES[row.version] && (row.statements ?? []).join('\n').trim() !== migration.sql) {
    throw new Error(`Historical alias ${row.version} does not match repository SQL; refusing to apply.`);
  }
  applied.add(version);
}
const pending = migrations.filter((migration) => !applied.has(migration.version));
console.log(JSON.stringify({ target, ref: refs[target], apply, pending: pending.map((entry) => ({
  file: entry.file, sha256: createHash('sha256').update(entry.sql).digest('hex'),
})) }, null, 2));
if (apply && pending.length) {
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const transaction = [
    'begin;', "set local lock_timeout = '10s';", "set local statement_timeout = '120s';",
    // Existing profiles are backfilled before later ALTER TABLE/RLS statements.
    // Check migration-only FK writes immediately so deferred trigger events do
    // not block that DDL. This does not change runtime constraint defaults or
    // disable validation, and keeps the historical migration SQL unchanged.
    'set constraints all immediate;',
    'lock table supabase_migrations.schema_migrations in exclusive mode;',
    ...pending.flatMap((entry) => [entry.sql,
      `insert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(entry.version)},${literal(entry.name)},array[${literal(entry.sql)}]);`]),
    "notify pgrst, 'reload schema';", 'commit;',
  ].join('\n');
  const directory = mkdtempSync(join(tmpdir(), 'aidoraa-migration-'));
  const file = join(directory, 'transaction.sql');
  try {
    writeFileSync(file, transaction, { mode: 0o600 });
    query(['--file', file]);
    console.log(`Applied ${pending.length} migrations atomically to ${target}.`);
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
}
