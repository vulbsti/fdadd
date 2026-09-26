import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const isEnvFile = (name) => name === '.env' || name.startsWith('.env.');

// Inspect the actual artifact, not just the source config. Vercel deduplicates
// functions using symlinks, so follow them once and reject dangling targets.
// Read only function metadata, never dotenv contents or environment values.
export function inspectPrebuiltFunctions(directory, projectRoot = process.cwd()) {
  const root = resolve(directory);
  const visited = new Set();
  const issues = [];
  let functionCount = 0;
  function checkFileMap(configPath, label) {
    let config;
    try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch {
      issues.push(`Unreadable function config: ${label}`);
      return;
    }
    for (const [destination, source] of Object.entries(config.filePathMap ?? {})) {
      if (typeof source !== 'string') {
        issues.push(`Invalid filePathMap entry: ${label}`);
        continue;
      }
      // CLI deploy reads source values relative to the project root. These
      // references need not exist physically inside the .func directory.
      const sourcePath = resolve(projectRoot, source);
      const isPublicTemplate = destination === '.env.example'
        && source === '.env.example';
      if (!isPublicTemplate && [...destination.split('/'), ...source.split('/')].some(isEnvFile)) {
        issues.push(`Environment file in filePathMap: ${label} -> ${destination}`);
        continue;
      }
      try {
        const actual = realpathSync(sourcePath);
        if (actual.split(sep).some(isEnvFile)
          && !(isPublicTemplate && actual === resolve(projectRoot, '.env.example'))) {
          issues.push(`filePathMap points to an environment file: ${label} -> ${destination}`);
        }
      } catch {
        issues.push(`Missing filePathMap source: ${label} -> ${destination}`);
      }
    }
  }
  function walk(path) {
    const label = relative(root, path) || '.';
    if (isEnvFile(basename(path))) {
      issues.push(`Environment file in function artifact: ${label}`);
      return;
    }
    let actual;
    let stat;
    try {
      actual = realpathSync(path);
      stat = statSync(actual);
    } catch {
      issues.push(`Missing or unreadable function artifact/link: ${label}`);
      return;
    }
    if (actual.split(sep).some(isEnvFile)) {
      issues.push(`Function artifact points to an environment file: ${label}`);
      return;
    }
    if (visited.has(actual)) return;
    visited.add(actual);
    if (!stat.isDirectory()) {
      if (basename(path) === '.vc-config.json') checkFileMap(actual, label);
      return;
    }
    if (path.endsWith('.func') || actual.endsWith('.func')) functionCount += 1;
    for (const entry of readdirSync(actual)) walk(join(path, entry));
  }
  walk(root);
  if (!functionCount) issues.push('No prebuilt functions found; run vercel build first.');
  return { functionCount, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = inspectPrebuiltFunctions('.vercel/output/functions');
  if (result.issues.length) {
    console.error(result.issues.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Prebuilt artifact check passed: ${result.functionCount} unique functions; file maps resolve, with no private dotenv files or dangling links.`);
  }
}
