/**
 * Atros Vedic-astrology calculations executed inside Vercel Sandbox.
 *
 * Server-side only: never import from Client Components. The model never
 * supplies argv, paths, or shell strings — every command below is built from
 * zod-validated `BirthData` fields via the allowlisted builders.
 *
 * NOTE (Step-4 spike decision): the Eve agent framework (`eve` on npm) was
 * evaluated and deferred — it is a filesystem-first durable-agent runtime
 * with its own server (`eve init` scaffold, `eve/tools`), not a tool-loop
 * adapter for Next.js route handlers. The astrologer loop is therefore a
 * manual OpenRouter tool loop (see `src/lib/astro/loop.ts`); Atros still
 * executes in Vercel Sandbox, never as a local subprocess.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Sandbox } from '@vercel/sandbox';

export const BirthDataSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(100),
  place_name: z.string().max(300).optional(),
});

export type BirthDataInput = z.infer<typeof BirthDataSchema>;

export type AtrosErrorCode = 'INVALID_BIRTHDATA' | 'EPHEMERIS_ERROR' | 'INTERNAL';

export type AtrosResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: AtrosErrorCode; message: string } };

const invalidBirthData = (message: string): AtrosResult => ({
  ok: false,
  error: { code: 'INVALID_BIRTHDATA', message },
});

function baseArgs(birth: BirthDataInput): string[] {
  return [
    '--date', birth.date,
    '--time', birth.time,
    '--lat', String(birth.latitude),
    '--lng', String(birth.longitude),
    '--tz', birth.timezone,
  ];
}

function namedArgs(birth: BirthDataInput): string[] {
  const args = ['--name', birth.name, ...baseArgs(birth)];
  if (birth.place_name) args.push('--place', birth.place_name);
  return args;
}

/** `atros chart --output json ...` — frozen chart facts. */
export function chartArgs(birth: BirthDataInput): string[] {
  return ['chart', ...namedArgs(birth), '--output', 'json'];
}

/**
 * `atros dasha ...` — Vimshottari timeline (text output: the CLI exposes no
 * `--output json` flag for this command, so callers receive raw text).
 */
export function dashaArgs(birth: BirthDataInput, years = 50): string[] {
  if (!Number.isInteger(years) || years < 1 || years > 120) {
    throw new Error('years must be an integer between 1 and 120');
  }
  // NOTE: `dasha` takes no --name/--place/--output flags upstream.
  return ['dasha', ...baseArgs(birth), '--years', String(years)];
}

/**
 * `atros current ...` — running dasha period (text output: no `--output
 * json` flag upstream).
 */
export function currentArgs(birth: BirthDataInput): string[] {
  return ['current', ...baseArgs(birth)];
}

/** `atros timeline --from --to --level --output json ...` */
export function timelineArgs(
  birth: BirthDataInput,
  from: string,
  to: string,
  level: 'maha' | 'antar' | 'pratyantar' | 'sookshma' = 'pratyantar',
): string[] {
  const window = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse({ from, to });
  if (!window.success) throw new Error('from/to must be YYYY-MM-DD');
  return [
    'timeline',
    ...baseArgs(birth),
    '--from', from,
    '--to', to,
    '--level', level,
    '--output', 'json',
  ];
}

/** `atros transit --as-of --output json ...` */
export function transitArgs(birth: BirthDataInput, asOf: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('asOf must be YYYY-MM-DD');
  return ['transit', ...baseArgs(birth), '--as-of', asOf, '--output', 'json'];
}

/** `atros sensitivity --output json ...` */
export function sensitivityArgs(birth: BirthDataInput, offsets?: number[]): string[] {
  const args = ['sensitivity', ...namedArgs(birth)];
  if (offsets !== undefined) {
    if (
      offsets.length === 0 ||
      offsets.length > 25 ||
      offsets.some((o) => !Number.isInteger(o) || o < -60 || o > 60)
    ) {
      throw new Error('offsets must be 1..25 integer minute offsets within ±60');
    }
    args.push('--offsets', offsets.join(','));
  }
  return [...args, '--output', 'json'];
}

export function parseBirthData(raw: unknown): BirthDataInput {
  const parsed = BirthDataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid birth data: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }
  return parsed.data;
}

const ATROS_DIR = '/tmp/atros-src';
const TOOL_TIMEOUT_MS = 25_000;

async function collectVendorFiles(): Promise<{ path: string; content: string }[]> {
  const root = path.join(process.cwd(), 'vendor', 'atros');
  const files: { path: string; content: string }[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else if (/\.py$|^pyproject\.toml$|^\.py$/i.test(entry.name) || entry.name === 'pyproject.toml') {
        files.push({
          path: `${ATROS_DIR}/${relPath}`,
          content: await fs.readFile(full, 'utf8'),
        });
      }
    }
  }
  await walk(root, '');
  return files;
}

async function ensureAtrosInstalled(sandbox: Sandbox): Promise<void> {
  const probe = await sandbox.runCommand('pip', ['show', 'atros']);
  if (probe.exitCode === 0) return;

  const files = await collectVendorFiles();
  await sandbox.writeFiles(files.map((f) => ({ path: f.path, content: f.content })));
  const install = await sandbox.runCommand(
    'pip',
    ['install', '--quiet', ATROS_DIR],
    { timeoutMs: 120_000 },
  );
  if (install.exitCode !== 0) {
    throw new Error(`atros install failed: ${await install.stderr()}`);
  }
  // Pre-warm ephemeris data at sandbox setup so per-turn calls stay in budget.
  await sandbox.runCommand(
    'atros',
    chartArgs({
      name: 'Warmup',
      date: '2000-04-22',
      time: '09:15',
      latitude: 26.4499,
      longitude: 80.3319,
      timezone: 'Asia/Kolkata',
    }),
    { timeoutMs: 120_000 },
  );
}

export interface RunAtrosOptions {
  sessionId: string;
  timeoutMs?: number;
}

/**
 * Run an allowlisted `atros` argv inside a per-session Vercel Sandbox.
 * Reuses the named sandbox across turns; 25s timeout with 1 retry.
 */
export async function runAtros(
  argv: string[],
  { sessionId, timeoutMs = TOOL_TIMEOUT_MS }: RunAtrosOptions,
): Promise<AtrosResult> {
  const sandbox = await Sandbox.getOrCreate({ name: `atros-${sessionId}` });

  try {
    await ensureAtrosInstalled(sandbox);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: error instanceof Error ? error.message : 'sandbox setup failed',
      },
    };
  }

  const wantsJson = argv.includes('--output') && argv.includes('json');
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await sandbox.runCommand('atros', argv, { timeoutMs });
      const stdout = await result.stdout();
      if (result.exitCode !== 0) {
        const stderr = await result.stderr().catch(() => '');
        lastError = (stderr || stdout || `exit ${result.exitCode}`).slice(0, 500);
        if (/ephemeris|swiss|kerykeion/i.test(lastError)) {
          return { ok: false, error: { code: 'EPHEMERIS_ERROR', message: lastError } };
        }
        continue; // retry once
      }
      if (wantsJson) {
        try {
          return { ok: true, data: JSON.parse(stdout) };
        } catch {
          lastError = 'atros returned non-JSON output';
          continue;
        }
      }
      return { ok: true, data: stdout };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'command failed';
    }
  }
  return { ok: false, error: { code: 'INTERNAL', message: lastError } };
}

export { invalidBirthData };
