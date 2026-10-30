/**
 * Runs the production Pi runner (runtime/pi/runner.mjs, unchanged) on an
 * evaluation case: one fresh workspace and conversation per question, asked
 * on the case's as-of date. Saves each answer with the agent's working files.
 *
 *   node --experimental-strip-types eval/harness/run.mjs <caseDir> [--variant masked|named] [--only q-id,q-id] [--out eval/runs/<name>]
 *
 * Needs OPENCODE_API_KEY and an Atros CLI at /tmp/atros-venv/bin/atros (see eval/README.md).
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspace } from './build-workspace.mts';
import { startBroker } from './broker.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const caseDir = path.resolve(args[0]);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = flag('--only')?.split(',');
const variant = flag('--variant') ?? 'masked';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(flag('--out') ?? path.join(repo, 'eval/runs', `${path.basename(caseDir)}-${variant}-${stamp}`));

const scratch = path.join(os.tmpdir(), `aidoraa-eval-${randomUUID().slice(0, 8)}`);
const base = path.join(scratch, 'base-workspace');
const built = await buildWorkspace(caseDir, base, variant);
const { questions, asOf } = JSON.parse(await readFile(path.join(caseDir, 'questions.json'), 'utf8'));
const events = new Map();
const broker = await startBroker({ onEvent: (id, event) => events.set(id, [...(events.get(id) ?? []), event]) });
const { name: _name, place_name: _place, ...birth } = built.case.birth;

async function ask(question) {
  const runId = randomUUID();
  const sessionId = randomUUID();
  const root = path.join(scratch, question.id);
  const workspace = path.join(root, 'workspace');
  const stateDirectory = path.join(root, 'state');
  await cp(base, workspace, { recursive: true });
  await mkdir(path.join(stateDirectory, 'runs'), { recursive: true });
  const configPath = path.join(stateDirectory, 'config.json');
  await writeFile(configPath, JSON.stringify({
    runId, workspace, stateDirectory, sessionDirectory: path.join(stateDirectory, 'sessions', sessionId),
    broker: broker.url(sessionId), astrologyEnabled: true, birth, birthRevision: 1,
    prompt: question.ask, deadlineMs: 15 * 60 * 1000, today: asOf,
    historyFile: `${asOf}-${question.id}-${sessionId.slice(0, 8)}.md`, conversation: [], edge: null,
  }));
  const started = Date.now();
  const log = [];
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repo, 'runtime/pi/runner.mjs'), configPath], { cwd: workspace, env: process.env });
    child.stdout.on('data', (d) => log.push(String(d)));
    child.stderr.on('data', (d) => log.push(String(d)));
    child.on('exit', resolve);
  });
  const result = { id: question.id, ask: question.ask, exitCode: code, seconds: Math.round((Date.now() - started) / 1000) };
  const target = path.join(outDir, question.id);
  await mkdir(target, { recursive: true });
  result.answer = await readFile(path.join(workspace, 'outputs', runId, 'answer.md'), 'utf8').catch(() => null);
  result.question = JSON.parse(await readFile(path.join(stateDirectory, 'runs', `${runId}.question.json`), 'utf8').catch(() => 'null'));
  result.tools = (events.get(sessionId) ?? []).filter((e) => e.kind === 'tool_start').map((e) => e.toolName);
  for (const dir of ['work', 'proposals']) await cp(path.join(workspace, dir), path.join(target, dir), { recursive: true }).catch(() => {});
  const sessions = path.join(stateDirectory, 'sessions', sessionId);
  for (const file of await readdir(sessions).catch(() => [])) await cp(path.join(sessions, file), path.join(target, 'session.jsonl'));
  await writeFile(path.join(target, 'runner.log'), log.join(''));
  await writeFile(path.join(target, 'result.json'), JSON.stringify(result, null, 2));
  if (result.answer) await writeFile(path.join(target, 'answer.md'), result.answer);
  return result;
}

await mkdir(outDir, { recursive: true });
const selected = questions.filter((q) => !only || only.includes(q.id));
const results = [];
// Questions are independent conversations; run a few at a time.
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 3);
for (let i = 0; i < selected.length; i += concurrency) {
  results.push(...await Promise.all(selected.slice(i, i + concurrency).map(ask)));
}
await writeFile(path.join(outDir, 'run.json'), JSON.stringify({
  case: built.case.id, variant, asOf, at: new Date().toISOString(), modelCalls: broker.usage.length,
  results: results.map(({ answer: _a, ...r }) => r),
}, null, 2));
await broker.close();
await rm(scratch, { recursive: true, force: true });
console.log(`Saved ${results.length} answers to ${path.relative(repo, outDir)}`);
