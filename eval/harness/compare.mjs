/**
 * Compares two scored runs and lists what moved: every metric, then each
 * checklist item, target event and gold rule whose verdict changed.
 *
 *   node eval/harness/compare.mjs <baselineRunDir> <candidateRunDir>
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [a, b] = await Promise.all(process.argv.slice(2, 4).map(async (dir) => JSON.parse(await readFile(path.join(dir, 'score.json'), 'utf8'))));
const lowerIsBetter = new Set(['futureLeaks', 'identityLeaks', 'contradictedPct']);
const lines = [`# ${b.run} vs ${a.run}`, '', '| Metric | Baseline | Candidate | |', '|---|---|---|---|'];
for (const key of Object.keys(b.metrics)) {
  const [x, y] = [a.metrics[key], b.metrics[key]];
  let mark = '';
  if (typeof x === 'number' && typeof y === 'number' && x !== y) mark = (y > x) !== lowerIsBetter.has(key) ? 'better' : '**worse**';
  lines.push(`| ${key} | ${x ?? '–'} | ${y ?? '–'} | ${mark} |`);
}
const rank = { anticipated: 3, partial: 2, missed: 1, contradicted: 0, agrees: 2, absent: 1, contradicts: 0 };
const changes = [];
for (const q of b.questions) {
  const before = a.questions.find((x) => x.id === q.id);
  if (!before) continue;
  const pairs = [
    ['checklist', 'item', (v) => (v.pass ? 1 : 0)],
    ['anticipated', 'eventId', (v) => rank[v.verdict] ?? 0],
    ['reasoning', 'goldId', (v) => rank[v.verdict] ?? 0],
  ];
  for (const [field, id, value] of pairs) {
    for (const item of q.judge?.[field] ?? []) {
      const old = (before.judge?.[field] ?? []).find((x) => x[id] === item[id]);
      if (!old || value(old) === value(item)) continue;
      changes.push(`- ${value(item) > value(old) ? 'Better' : '**Worse**'}: ${q.id} ${field} ${item[id]}: ${old.verdict ?? old.pass} → ${item.verdict ?? item.pass}. ${item.why ?? ''}`);
    }
  }
  for (const f of q.checks.facts) {
    const old = before.checks.facts.find((x) => x.check === f.check);
    if (old && old.pass !== f.pass) changes.push(`- ${f.pass ? 'Better' : '**Worse**'}: ${q.id} fact ${f.check} now ${f.pass ? 'correct' : 'wrong'} (expected ${f.expected})`);
  }
}
lines.push('', '## Changed verdicts', '', ...(changes.length ? changes.sort((x, y) => (y.includes('Worse') ? 1 : 0) - (x.includes('Worse') ? 1 : 0)) : ['None.']));
console.log(lines.join('\n'));
