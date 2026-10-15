/**
 * Runs the Astrologer workflow with a different model: prepares the same
 * workspace, trusted prompt, skills and question the Pi runner would use, so
 * any agent with file tools (for example a Claude Code subagent) can play Pi.
 * Then collects its answers in the run format score.mjs and compare.mjs read.
 * Separates model quality from workflow quality. --max-words caps the answer
 * length so a wordier model does not get credit for covering more events.
 *
 *   node --experimental-strip-types eval/harness/sim.mjs prepare <caseDir> --out <runDir> [--variant masked|named] [--only q-id,...]
 *   (each <runDir>/<q-id>/PROMPT.md is the agent's whole task; it works in <runDir>/<q-id>/workspace)
 *   node --experimental-strip-types eval/harness/sim.mjs collect <caseDir> --out <runDir> --model <label>
 */
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspace } from './build-workspace.mts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, caseArg, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const caseDir = path.resolve(caseArg);
const outDir = path.resolve(flag('--out'));
const variant = flag('--variant') ?? 'masked';
const only = flag('--only')?.split(',');
const maxWords = flag('--max-words');
const { questions, asOf } = JSON.parse(await readFile(path.join(caseDir, 'questions.json'), 'utf8'));
const selected = questions.filter((q) => !only || only.includes(q.id));
const pi = path.join(repo, 'runtime/pi');

const skillHeader = async (name) => {
  const text = await readFile(path.join(pi, 'skills', name, 'SKILL.md'), 'utf8');
  return text.match(/^description:\s*(.+)$/m)?.[1] ?? '';
};

if (mode === 'prepare') {
  const base = path.join(outDir, '.base-workspace');
  await buildWorkspace(caseDir, base, variant);
  const system = await readFile(path.join(pi, 'system-prompt.md'), 'utf8');
  const skills = ['person-context', 'chart-reading', 'rectify'];
  for (const q of selected) {
    const dir = path.join(outDir, q.id);
    const workspace = path.join(dir, 'workspace');
    await cp(base, workspace, { recursive: true });
    // The runtime copies skills into the agent's skill list; here they sit next to the workspace.
    for (const s of skills) await cp(path.join(pi, 'skills', s), path.join(dir, 'skills', s), { recursive: true });
    const historyFile = `${asOf}-${q.id}.md`;
    const listing = (await Promise.all(skills.map(async (s) => `- **${s}** (\`${path.join(dir, 'skills', s, 'SKILL.md')}\`): ${await skillHeader(s)}`))).join('\n');
    await writeFile(path.join(dir, 'PROMPT.md'), `You are playing the Aidoraa Astrologer agent in an evaluation. Follow the system prompt below exactly as if it were your own, using only the files in your workspace.

Workspace (your only working directory; never read outside it except the skill files listed): \`${workspace}\`

Tools: use your file tools (read, grep, find, ls, bash, write, edit) inside the workspace. The runtime's extra tools map as follows:
- \`ask_person\`: write the one question to \`${path.join(dir, 'question.json')}\` as {"prompt": "...", "options": [{"label": "...", "control": true|false}]} (at most once).
- \`person_state\`: not available here; read \`person/\` and \`notes/\` instead.
- \`recalculate\`: not available; the chart files are already computed.
Write your final answer to the person, exactly as they would see it, to \`${path.join(dir, 'answer.md')}\`. Write any working files where the system prompt says (under the workspace).${maxWords ? `\nKeep answer.md under ${maxWords} words, so length matches the model it is compared with.` : ''}

---

# System prompt

${system}

Today is ${asOf}. Astrology is enabled and their birth chart is calculated. This conversation is \`history/${historyFile}\`; earlier conversations are listed in \`history/index.md\`.

# Skills (read a skill's file before doing what its description covers)

${listing}

---

# The person's message

${q.ask}
`);
  }
  console.log(`Prepared ${selected.length} questions in ${path.relative(repo, outDir)}`);
} else if (mode === 'collect') {
  const model = flag('--model') ?? 'unknown';
  const results = [];
  for (const q of selected) {
    const dir = path.join(outDir, q.id);
    const answer = await readFile(path.join(dir, 'answer.md'), 'utf8').catch(() => null);
    const raw = JSON.parse(await readFile(path.join(dir, 'question.json'), 'utf8').catch(() => 'null'));
    const question = raw && {
      prompt: raw.prompt, responseKind: (raw.options ?? []).length >= 2 ? 'single_choice' : 'free_text', allowFreeText: true,
      options: (raw.options ?? []).map((o, i) => ({ id: `option-${i + 1}`, label: o.label, kind: o.control ? 'control' : 'answer' })),
    };
    const result = { id: q.id, ask: q.ask, exitCode: answer ? 0 : 1, answer, question };
    await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    if (await stat(path.join(dir, 'workspace/work')).catch(() => null)) await cp(path.join(dir, 'workspace/work'), path.join(dir, 'work'), { recursive: true });
    results.push(result);
  }
  await writeFile(path.join(outDir, 'run.json'), JSON.stringify({
    case: path.basename(caseDir), variant, asOf, at: new Date().toISOString(), model, simulated: true,
    results: results.map(({ answer: _a, ...r }) => r),
  }, null, 2));
  console.log(`Collected ${results.filter((r) => r.answer).length}/${results.length} answers`);
} else {
  console.error('Usage: sim.mjs prepare|collect <caseDir> --out <runDir> ...');
  process.exit(1);
}
