import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function findMissingEnvironmentKeys(contents, requiredKeys) {
  const values = new Map();
  for (const rawLine of contents.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values.set(match[1], match[2]);
  }
  return requiredKeys.filter((key) => {
    const rawValue = values.get(key);
    if (rawValue === undefined) return true;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2').trim();
    return value.length === 0;
  });
}

function main() {
  const [filePath, ...requiredKeys] = process.argv.slice(2);
  if (!filePath || requiredKeys.length === 0) {
    throw new Error('Usage: node scripts/assert-vercel-env-keys.mjs <env-file> <KEY> [KEY...]');
  }
  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Vercel environment file is missing: ${filePath}`);
  }
  const missing = findMissingEnvironmentKeys(contents, requiredKeys);
  if (missing.length) {
    throw new Error(`Required Vercel production environment variables are missing or empty: ${missing.join(', ')}`);
  }
  console.log(`Required Vercel production environment variables are configured: ${requiredKeys.join(', ')}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Vercel environment preflight failed.');
    process.exitCode = 1;
  }
}
