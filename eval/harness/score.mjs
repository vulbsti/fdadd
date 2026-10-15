/**
 * Scores a run against the case's gold data. Two layers:
 *  - checks: deterministic, from code (dasha facts against the stored
 *    timeline, chart jargon, day/week-level claims, the one question,
 *    knowledge the inputs never gave);
 *  - judge: a model reads the answer with the gold timeline, rules and
 *    readings and returns per-item verdicts with quotes. Fixed rubric below.
 *
 *   node eval/harness/score.mjs <caseDir> <runDir> [--no-judge]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const [caseDirArg, runDirArg, ...rest] = process.argv.slice(2);
const caseDir = path.resolve(caseDirArg);
const runDir = path.resolve(runDirArg);
const useJudge = !rest.includes('--no-judge');
const read = async (p) => JSON.parse(await readFile(path.join(caseDir, p), 'utf8'));

const kase = await read('case.json');
const { questions, asOf } = await read('questions.json');
// A case may keep its held-out events in a separate file so the gold builders never see them.
const events = [...await read(kase.gold.lifeEvents), ...(kase.gold.lifeEventsHoldout ? (await read(kase.gold.lifeEventsHoldout)).map((e) => ({ ...e, set: 'holdout' })) : [])];
const traits = await read(kase.gold.traits);
const rules = await read(kase.gold.rules).catch(() => []);
const natal = await read(kase.gold.natalVerdicts).catch(() => []);
const calibration = await read(kase.gold.calibration).catch(() => []);
const timeline = JSON.parse(await readFile(path.join(caseDir, 'chart/periods-pratyantar.json'), 'utf8')).rows;

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const JARGON = /\b(maha ?dasha|antar ?dasha|pratyantar|dasha|bhukti|nakshatra|lagna|ascendant|house lord|\d+(st|nd|rd|th) house|retrograde|debilitat\w*|exalt\w*|neecha|bhanga|yoga|navamsa|D9|D10|transit|sade sati|Rahu|Ketu|ayanamsa|whole-sign)\b/gi;
const SHORT_HORIZON = /\b(this week|next week|this weekend|tomorrow|today will|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in the coming days|next few days)\b/gi;

function chainOn(date) {
  return timeline.find((r) => r.pratyantar.start <= date && date < r.pratyantar.end);
}
function nextMahadasha(date) {
  const now = chainOn(date);
  return timeline.find((r) => r.mahadasha.start > now.mahadasha.start);
}
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const mentionsDate = (text, iso) => text.includes(iso) || text.includes(longDate(iso)) || text.includes(longDate(iso).replace(/,/, ''));

/** Facts an answer must state exactly, derived from the stored timeline. */
function factChecks(question, answer) {
  if (!question.facts) return [];
  const now = chainOn(asOf);
  const next = nextMahadasha(asOf);
  const out = [];
  const near = (planet, word) => new RegExp(`${planet}[^.\\n]{0,60}${word}|${word}[^.\\n]{0,60}${planet}`, 'i').test(answer);
  for (const fact of question.facts) {
    if (fact === 'mahadasha-now') out.push({ check: fact, expected: now.mahadasha.planet, pass: near(now.mahadasha.planet, 'maha') || near(now.mahadasha.planet, 'major') });
    if (fact === 'antardasha-now') out.push({ check: fact, expected: now.antardasha.planet, pass: near(now.antardasha.planet, 'antar') || near(now.antardasha.planet, 'sub') });
    if (fact === 'next-antardasha-start') {
      const nextAd = timeline.find((r) => r.antardasha.start > now.antardasha.start);
      out.push({ check: fact, expected: `${nextAd.antardasha.planet} from ${nextAd.antardasha.start}`, pass: answer.includes(nextAd.antardasha.planet) && mentionsDate(answer, nextAd.antardasha.start) });
    }
    if (fact === 'next-mahadasha-start') out.push({ check: fact, expected: `${next.mahadasha.planet} from ${next.mahadasha.start}`, pass: answer.includes(next.mahadasha.planet) && mentionsDate(answer, next.mahadasha.start) });
  }
  // Any "<Planet> mahadasha" named for the as-of date must be the stored one.
  const named = [...answer.matchAll(new RegExp(`\\b(${PLANETS.join('|')})\\s+(maha ?dasha|major period)`, 'gi'))].map((m) => m[1]);
  const wrong = named.filter((p) => ![now.mahadasha.planet, next.mahadasha.planet].some((ok) => ok.toLowerCase() === p.toLowerCase()));
  if (wrong.length) out.push({ check: 'no-wrong-mahadasha', expected: `${now.mahadasha.planet} or ${next.mahadasha.planet}`, found: wrong, pass: false });
  return out;
}

const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termsRegex = (terms, flags) => new RegExp(`\\b(${(terms ?? []).map(escape).join('|') || '(?!)'})\\b`, flags);
/** Knowledge after the cut-off that the inputs never contained (case.json leakTerms). */
const LEAK_TERMS = termsRegex(kase.leakTerms, 'gi');
// In a masked run the inputs never name the person; naming them (case.json identityTerms) means the model recognised them.
const IDENTITY_TERMS = termsRegex(kase.identityTerms, 'g');

const run = JSON.parse(await readFile(path.join(runDir, 'run.json'), 'utf8').catch(() => '{}'));

function checks(question, result) {
  const answer = result.answer ?? '';
  const jargon = [...answer.matchAll(JARGON)].map((m) => m[0]);
  const askedForChart = /dasha|chart|planet|astrolog/i.test(question.ask);
  return {
    completed: result.exitCode === 0 && Boolean(answer),
    words: answer.split(/\s+/).filter(Boolean).length,
    facts: factChecks(question, answer),
    jargonTerms: jargon.length,
    jargonPer100Words: Math.round((jargon.length / Math.max(1, answer.split(/\s+/).length)) * 1000) / 10,
    jargonOk: askedForChart || jargon.length <= 2,
    shortHorizon: [...answer.matchAll(SHORT_HORIZON)].map((m) => m[0]),
    askedQuestion: Boolean(result.question),
    questionHasControl: Boolean(result.question?.options?.some((o) => o.kind === 'control')),
    leakedFutureKnowledge: [...new Set([...answer.matchAll(LEAK_TERMS)].map((m) => m[0]))],
    recognisedIdentity: run.variant === 'masked' ? [...new Set([...answer.matchAll(IDENTITY_TERMS)].map((m) => m[0]))] : [],
    toolsUsed: result.tools ?? [],
  };
}

const RUBRIC = `You are grading one answer from "Aidoraa", an assistant meant to understand a person's life using their own history plus Vedic astrology as one lens.
The answer was written on ${asOf}, from the person's history up to that date and their birth chart. You also get the GOLD data: what really happened after that date, and the reference reasoning an ideal analyst reaches. Grade strictly and quote the answer for every verdict. Return ONLY JSON.

Product standard (from docs/VISION.md):
- life-terms: makes sense to someone who knows nothing about astrology.
- specific-to-person: about this person, using at least one detail from their own life; would be wrong for someone else with the same chart.
- past-present-future: connects past, present and future rather than describing a moment.
- direction: says what to do or which direction pays off, and why.
- certainty-stated: says how sure it is in plain words, and where chart and life disagree.
- one-testing-question: asks at most one question, whose answer would change the reading, including an option that would prove it wrong.
- no-day-week-level: no day- or week-level predictions.
- misses-explained: where the chart did not match their past, it says so and why.
- evidence-from-their-life: claims about their character rest on things they did or said.
- need-behind-question: answers the need behind the literal question.
- facts-from-stored-timeline: any period names or dates match storedTimeline (every period from a year before to three years after now; storedTimelineNow is the running chain).

Output schema:
{
 "checklist": [ { "item": "<one of the ids asked>", "pass": true|false, "quote": "...", "why": "..." } ],
 "anticipated": [ { "eventId": "...", "verdict": "anticipated|partial|missed|contradicted", "quote": "...", "why": "..." } ],
 "claims": [ { "claim": "a concrete forward-looking claim the answer makes", "verdict": "happened|partly|did-not-happen|unclear", "eventIds": ["..."], "why": "..." } ],
 "reasoning": [ { "goldId": "rule or reading id", "verdict": "agrees|contradicts|absent", "quote": "...", "why": "..." } ],
 "summary": "two sentences on the biggest gap between this answer and the gold"
}
"anticipated": one entry for EACH target event listed. "anticipated" means the answer pointed to that kind of development (domain + direction) in roughly that time window, in any wording; "partial" = right domain or direction but not both, or timing off by more than a year; "contradicted" = the answer predicted the opposite.
"reasoning": only when gold rules/readings are given; one entry per gold item.`;

async function judge(question, answer, attempt = 1) {
  const key = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim();
  if (!key) throw new Error('OPENCODE_API_KEY is not set; run with --no-judge for code checks only.');
  const window = question.window ?? [asOf, asOf];
  const a = question.anticipate;
  const targets = a ? events.filter((e) => e.set === 'holdout' && e.date >= window[0] && e.date <= window[1]
    && e.magnitude >= (a.minMagnitude ?? 1)
    && (!a.domains || e.domains.some((d) => a.domains.includes(d)))
    && (!a.valence || a.valence.includes(e.valence))) : [];
  const holdout = events.filter((e) => e.set === 'holdout' && e.date <= window[1]).map(({ id, date, title, domains, valence, magnitude }) => ({ id, date, title, domains, valence, magnitude }));
  const goldReasoning = question.gold?.includes('rules') ? { rules, natalVerdicts: natal.filter((n) => n.verdict !== 'open') } : null;
  const goldTraits = question.gold?.includes('traits-before-cutoff') ? traits.filter((t) => Number(String(t.firstSeen).slice(0, 4)) <= Number(asOf.slice(0, 4))) : null;
  const goldCalibration = question.gold?.includes('calibration')
    ? calibration.map(({ id, md, ad, from, to, periodVerdict, lessons }) => ({ id, md, ad, from, to, periodVerdict, lessons })) : null;
  const now = chainOn(asOf);
  // Every period from a year before the as-of date to three years after, so a correctly named next period is checkable.
  const shift = (iso, years) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
  const storedTimeline = timeline.filter((r) => r.pratyantar.end > shift(asOf, -1) && r.pratyantar.start < shift(asOf, 3))
    .map((r) => `${r.mahadasha.planet}-${r.antardasha.planet}-${r.pratyantar.planet} ${r.pratyantar.start} to ${r.pratyantar.end}`);
  const payload = {
    question: question.ask, checklistItems: question.checks,
    storedTimelineNow: { mahadasha: now.mahadasha, antardasha: now.antardasha, pratyantar: now.pratyantar, nextMahadasha: nextMahadasha(asOf).mahadasha },
    storedTimeline, goldCalibration,
    targetEvents: targets.map(({ id, date, title, description, domains, valence, magnitude }) => ({ id, date, title, description, domains, valence, magnitude })),
    allLaterEvents: holdout, goldReasoning, goldTraits, answer,
  };
  // Streamed: the provider cuts off non-streamed responses that take longer than about 30 s.
  const response = await fetch('https://opencode.ai/zen/go/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-opencode-session': `judge-${kase.id}-${question.id}-${Date.now()}` },
    body: JSON.stringify({ model: process.env.JUDGE_MODEL ?? 'gpt-6-luna', reasoning: { effort: 'medium' }, max_output_tokens: 16000, stream: true, text: { format: { type: 'json_object' } },
      input: [{ role: 'system', content: RUBRIC }, { role: 'user', content: JSON.stringify(payload) }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`judge ${response.status}: ${(await response.text()).slice(0, 300)}`);
  let text = '';
  let buffer = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5).trim() || 'null');
      if (event?.type === 'response.output_text.delta') text += event.delta;
      if (event?.type === 'response.failed' || event?.type === 'error') throw new Error(`judge stream: ${JSON.stringify(event).slice(0, 300)}`);
    }
  }
  let parsed;
  try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (error) {
    if (attempt < 3) return judge(question, answer, attempt + 1);
    throw error;
  }
  return { ...parsed, targets: targets.map((t) => t.id) };
}

function metrics(scored) {
  const all = (f) => scored.flatMap(f);
  const anticipated = all((s) => s.judge?.anticipated ?? []);
  const claims = all((s) => s.judge?.claims ?? []);
  const checklist = all((s) => s.judge?.checklist ?? []);
  const reasoning = all((s) => s.judge?.reasoning ?? []);
  const share = (xs, pred) => xs.length ? Math.round((xs.filter(pred).length / xs.length) * 100) : null;
  return {
    completed: `${scored.filter((s) => s.checks.completed).length}/${scored.length}`,
    factsCorrect: share(all((s) => s.checks.facts), (f) => f.pass),
    jargonOk: share(scored, (s) => s.checks.jargonOk),
    shortHorizonFree: share(scored, (s) => !s.checks.shortHorizon.length),
    futureLeaks: all((s) => s.checks.leakedFutureKnowledge).length,
    identityLeaks: all((s) => s.checks.recognisedIdentity).length,
    anticipatedPct: share(anticipated, (a) => a.verdict === 'anticipated'),
    anticipatedOrPartialPct: share(anticipated, (a) => a.verdict !== 'missed' && a.verdict !== 'contradicted'),
    contradictedPct: share(anticipated, (a) => a.verdict === 'contradicted'),
    claimsHappenedPct: share(claims.filter((c) => c.verdict !== 'unclear'), (c) => c.verdict === 'happened' || c.verdict === 'partly'),
    checklistPassPct: share(checklist, (c) => c.pass),
    reasoningAgreesPct: share(reasoning, (r) => r.verdict === 'agrees'),
  };
}

const scored = [];
for (const question of questions) {
  const result = JSON.parse(await readFile(path.join(runDir, question.id, 'result.json'), 'utf8').catch(() => 'null'));
  if (!result) continue;
  const entry = { id: question.id, checks: checks(question, result) };
  if (useJudge && result.answer) entry.judge = await judge(question, result.answer).catch((error) => ({ error: error.message }));
  scored.push(entry);
}
const report = { case: kase.id, variant: run.variant, run: path.basename(runDir), scoredAt: new Date().toISOString(), judged: useJudge, metrics: metrics(scored), questions: scored };
await writeFile(path.join(runDir, 'score.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.metrics, null, 2));
