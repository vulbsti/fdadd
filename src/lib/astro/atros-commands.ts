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

/**
 * Bump on any vendored Atros behavior change: it keys the calculation cache.
 */
export const ATROS_ENGINE_VERSION = '0.1.0+aidoraa.20260914';

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
const VENV_BIN = '/tmp/atros-venv/bin';
const TOOL_TIMEOUT_MS = 25_000;
const TEMPLATE_NAME = 'atros-template';
const SETUP_MARKER = `/tmp/atros-ready-${ATROS_ENGINE_VERSION.replace(/[^a-zA-Z0-9]/g, '-')}`;
const SETUP_LOCK = `${SETUP_MARKER}.lock`;
const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;

let sharedSandbox: Sandbox | null = null;

async function collectVendorFiles(): Promise<{ path: string; content: string }[]> {
  // Static string, not path.join(process.cwd(), ...): Turbopack's workflow
  // loader lints dynamic `path.join(process.cwd(), x ? y : z)` calls as
  // TP1006 errors, which fail every dev request.
  const root = `${process.cwd()}/vendor/atros`;
  const files: { path: string; content: string }[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const full = `${dir}/${entry.name}`;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else if (/\.py$/.test(entry.name) || entry.name === 'pyproject.toml' || entry.name === 'README.md') {
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
export async function ensureAtrosInstalled(sandbox: Sandbox): Promise<void> {
  const ready = await sandbox.runCommand('bash', [
    '-lc',
    `${VENV_BIN}/pip show atros >/dev/null 2>&1 && test -f '${SETUP_MARKER}'`,
  ]);
  if (ready.exitCode === 0) return;

  // Two Workflow branches can reach setup together. The lock is inside the
  // shared sandbox, so it also coordinates separate serverless invocations.
  const lock = await sandbox.runCommand(
    'bash',
    [
      '-lc',
      [
        `if mkdir '${SETUP_LOCK}' 2>/dev/null; then exit 0; fi`,
        `for attempt in $(seq 1 120); do`,
        `  if test -f '${SETUP_MARKER}'; then exit 42; fi`,
        `  if mkdir '${SETUP_LOCK}' 2>/dev/null; then exit 0; fi`,
        '  sleep 1',
        'done',
        'exit 1',
      ].join('\n'),
    ],
    { timeoutMs: 130_000 },
  );
  if (lock.exitCode === 42) return;
  if (lock.exitCode !== 0) throw new Error('timed out waiting for Atros setup lock');

  try {
    const afterLock = await sandbox.runCommand('bash', [
      '-lc',
      `${VENV_BIN}/pip show atros >/dev/null 2>&1 && test -f '${SETUP_MARKER}'`,
    ]);
    if (afterLock.exitCode === 0) return;

    // Debian's PEP 668 lock forbids system-wide pip installs; atros lives in a venv.
    const mkvenv = await sandbox.runCommand('python3', ['-m', 'venv', '/tmp/atros-venv'], {
      timeoutMs: 300_000,
    });
    if (mkvenv.exitCode !== 0) {
      // Minimal images lack ensurepip: install python3-venv, then retry once.
      await sandbox.runCommand('sudo', ['apt-get', 'update', '-qq'], { timeoutMs: 300_000 });
      await sandbox.runCommand('sudo', ['apt-get', 'install', '-y', '-qq', 'python3-venv'], {
        timeoutMs: 300_000,
      });
      const retry = await sandbox.runCommand('python3', ['-m', 'venv', '/tmp/atros-venv'], {
        timeoutMs: 120_000,
      });
      if (retry.exitCode !== 0) {
        throw new Error(`venv creation failed: ${await retry.stderr()}`);
      }
    }
    // pyswisseph (via kerykeion) ships no wheel for the sandbox Python, so the
    // toolchain must exist before pip runs. Passwordless sudo is available.
    const sysdeps = await sandbox.runCommand(
      'sudo',
      ['apt-get', 'install', '-y', '-qq', 'build-essential', 'pkg-config', 'python3-dev'],
      { timeoutMs: 300_000 },
    );
    if (sysdeps.exitCode !== 0) {
      // Package lists may be stale on a fresh image; refresh once and retry.
      await sandbox.runCommand('sudo', ['apt-get', 'update', '-qq'], { timeoutMs: 300_000 });
      const retry = await sandbox.runCommand(
        'sudo',
        ['apt-get', 'install', '-y', '-qq', 'build-essential', 'pkg-config', 'python3-dev'],
        { timeoutMs: 300_000 },
      );
      if (retry.exitCode !== 0) {
        throw new Error(`system deps install failed: ${await retry.stderr()}`);
      }
    }

    const files = await collectVendorFiles();
    await sandbox.writeFiles(files.map((f) => ({ path: f.path, content: f.content })));
    const install = await sandbox.runCommand(
      `${VENV_BIN}/pip`,
      ['install', '--quiet', ATROS_DIR],
      { timeoutMs: 120_000 },
    );
    if (install.exitCode !== 0) {
      throw new Error(`atros install failed: ${await install.stderr()}`);
    }
    // Pre-warm ephemeris data at sandbox setup so per-turn calls stay in budget.
    // The warmup doubles as an install verification: a broken dependency chain
    // (e.g. pyswisseph missing for the sandbox Python) fails HERE, not on the
    // first real calculation.
    const warmup = await sandbox.runCommand(
      `${VENV_BIN}/atros`,
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
    if (warmup.exitCode !== 0) {
      const stderr = await warmup.stderr().catch(() => '');
      throw new Error(`atros warmup failed: ${(stderr || `exit ${warmup.exitCode}`).slice(0, 500)}`);
    }
    await sandbox.runCommand('touch', [SETUP_MARKER]);
  } finally {
    await sandbox.runCommand('rm', ['-rf', SETUP_LOCK]).catch(() => undefined);
  }
}

/** Get one shared sandbox; Atros receives only validated argv and writes no user data. */
async function getAtrosSandbox(): Promise<Sandbox> {
  if (sharedSandbox) return sharedSandbox;
  try {
    sharedSandbox = await Sandbox.getOrCreate({
      name: TEMPLATE_NAME,
      timeout: SANDBOX_TIMEOUT_MS,
    });
  } catch {
    // Keep a no-snapshot fallback for Hobby accounts that cannot create or
    // resume the named sandbox. The shared path above avoids forks entirely.
    sharedSandbox = await Sandbox.create({ timeout: SANDBOX_TIMEOUT_MS, persistent: false });
  }
  return sharedSandbox;
}

/** Prepare the shared sandbox once before a durable intake fan-out. */
export async function ensureAtrosReady(): Promise<void> {
  await ensureAtrosInstalled(await getAtrosSandbox());
}

export interface RunAtrosOptions {
  sessionId: string;
  timeoutMs?: number;
}

export interface AtrosCommandResult {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}

export type AtrosCommandExecutor = (
  argv: string[],
  timeoutMs: number,
) => Promise<AtrosCommandResult>;

/** Interpret and retry an Atros command independently of Sandbox transport. */
export async function executeAtrosWithRetry(
  argv: string[],
  timeoutMs: number,
  execute: AtrosCommandExecutor,
): Promise<AtrosResult> {
  const wantsJson = argv.includes('--output') && argv.includes('json');
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await execute(argv, timeoutMs);
      const stdout = await result.stdout();
      if (result.exitCode !== 0) {
        const stderr = await result.stderr().catch(() => '');
        lastError = (stderr || stdout || `exit ${result.exitCode}`).slice(0, 500);
        if (/ephemeris|swiss|kerykeion/i.test(lastError)) {
          return { ok: false, error: { code: 'EPHEMERIS_ERROR', message: lastError } };
        }
        continue;
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

/**
 * Run an allowlisted `atros` argv inside the shared Vercel Sandbox.
 * Reuses the prepared environment across sessions; 25s timeout with 1 retry.
 */
export async function runAtros(
  argv: string[],
  { sessionId, timeoutMs = TOOL_TIMEOUT_MS }: RunAtrosOptions,
): Promise<AtrosResult> {
  void sessionId;
  const sandbox = await getAtrosSandbox();

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

  return executeAtrosWithRetry(argv, timeoutMs, async (commandArgs, commandTimeoutMs) => {
    const result = await sandbox.runCommand(`${VENV_BIN}/atros`, commandArgs, {
      timeoutMs: commandTimeoutMs,
    });
    return {
      exitCode: result.exitCode,
      stdout: () => result.stdout(),
      stderr: () => result.stderr(),
    };
  });
}

export { invalidBirthData };
