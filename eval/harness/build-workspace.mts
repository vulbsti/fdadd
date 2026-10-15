/**
 * Builds the workspace the chat agent would see for an evaluation case, using
 * the app's own renderers so the files match production byte for byte where
 * the app has a renderer. Calculations run through the vendored Atros CLI.
 *
 *   node --experimental-strip-types eval/harness/build-workspace.mts <caseDir> <outDir> [masked|named]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chartArgs, sensitivityArgs, timelineArgs, transitArgs } from '../../src/lib/astro/atros-commands.ts';
import { astrologyWorkspaceFiles, TimelineSchema, timelineWindow, transitDates } from '../../src/lib/astro/calculations.ts';
import { buildHistory, type HistoryMessage, type HistorySession } from '../../src/lib/astro/conversation-history.ts';

const run = promisify(execFile);

export interface EvalCase {
  id: string;
  asOf: string;
  birth: { name: string; date: string; time: string; latitude: number; longitude: number; timezone: string; place_name?: string };
  timeSource?: string;
  timeConfidence?: string;
  inputs: Record<string, { profile: string; history: string; name?: string; place_name?: string }>;
}

async function atros(argv: string[]) {
  const bin = process.env.ATROS_BIN ?? '/tmp/atros-venv/bin/atros';
  const { stdout } = await run(bin, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 });
  return JSON.parse(stdout);
}

export async function calculations(c: EvalCase) {
  const window = timelineWindow(c.birth.date);
  const [chart, sensitivity, timeline] = await Promise.all([
    atros(chartArgs(c.birth)), atros(sensitivityArgs(c.birth)), atros(timelineArgs(c.birth, window.from, window.to, 'pratyantar')),
  ]);
  const transits = [];
  for (const date of transitDates(new Date(`${c.asOf}T12:00:00Z`))) transits.push(await atros(transitArgs(c.birth, date)));
  return { birthRevision: 1, engineVersion: 'vendored', chart, sensitivity, timeline: TimelineSchema.parse(timeline), transits };
}

export async function buildWorkspace(caseDir: string, outDir: string, variant = 'masked') {
  const c: EvalCase = JSON.parse(await readFile(path.join(caseDir, 'case.json'), 'utf8'));
  const inputs = c.inputs[variant];
  if (!inputs) throw new Error(`Case ${c.id} has no '${variant}' inputs.`);
  const files: Array<{ path: string; content: string }> = [];
  const add = (p: string, value: unknown) => files.push({ path: p, content: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });

  // The chart files print the name and birthplace, so a masked case uses its masked ones.
  const calc = await calculations({ ...c, birth: { ...c.birth, name: inputs.name ?? c.birth.name, place_name: inputs.place_name ?? c.birth.place_name } });
  const { name: _name, place_name: _place, ...birth } = c.birth;
  add('astrology/birth.json', birth);
  for (const file of astrologyWorkspaceFiles(calc, c.asOf, { timeSource: c.timeSource, timeConfidence: c.timeConfidence })) files.push(file);

  const sessions: Array<HistorySession & { messages: Array<Omit<HistoryMessage, 'id' | 'sessionId'>> }> =
    JSON.parse(await readFile(path.join(caseDir, inputs.history), 'utf8'));
  const messages: HistoryMessage[] = sessions.flatMap((s) => s.messages.map((m, i) => ({ ...m, id: `${s.id}-${i}`, sessionId: s.id })));
  const history = buildHistory(sessions.map(({ id, title, createdAt }) => ({ id, title, createdAt })), messages, new Set());
  files.push(...history.files);

  add('person/profile.md', await readFile(path.join(caseDir, inputs.profile), 'utf8'));
  add('notes/theory-of-mind.md', '# Theory of mind\n\nNothing yet: this is an early conversation with this person. It will be written from what they share.\n');

  await rm(outDir, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(outDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return { case: c, timeline: calc.timeline, files: files.map((f) => f.path) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [caseDir, outDir, variant] = process.argv.slice(2);
  const built = await buildWorkspace(caseDir, outDir, variant);
  console.log(JSON.stringify({ case: built.case.id, files: built.files.length }));
}
