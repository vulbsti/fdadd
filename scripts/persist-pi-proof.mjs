// Persist only synthetic, explicitly allowlisted evidence. Never publish a raw
// Playwright trace: even post-login traces contain reusable authentication.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const parent = 'test-results/pi-workspace-staging';
if (JSON.parse(readFileSync(join(parent, '.last-run.json'), 'utf8')).status !== 'passed') {
  throw new Error('Only a passed Pi proof can be published as acceptance evidence.');
}
const directories = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('pi-workspace-Pi-workspace-'));
if (directories.length !== 1) throw new Error('Expected one unambiguous Pi proof directory.');
const source = join(parent, directories[0].name);
const trace = join(source, 'SENSITIVE-LOCAL-ONLY-after-auth-trace.zip');
const readEntry = (name) => execFileSync('unzip', ['-p', trace, name], { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const network = readEntry('trace.network').trim().split('\n').map(JSON.parse).map((entry) => entry.snapshot);
const requests = network.filter((entry) => new URL(entry.request.url).pathname.startsWith('/api/astrologer/'));
const origins = [...new Set(requests.map((entry) => new URL(entry.request.url).origin))];
if (origins.length !== 1 || !/^https:\/\/fdadd-[a-z0-9-]+-vulbstis-projects\.vercel\.app$/.test(origins[0])) {
  throw new Error('Unexpected or mixed browser targets.');
}
const runs = new Map();
for (const entry of requests) {
  if (!/^\/api\/astrologer\/sessions\/[^/]+$/.test(new URL(entry.request.url).pathname)
      || entry.response.status !== 200 || !entry.response.content._file) continue;
  const detail = JSON.parse(readEntry(entry.response.content._file));
  if (detail.session?.profileName !== 'Pi Synthetic Person') throw new Error('Refusing non-synthetic person evidence.');
  const run = detail.latestRun;
  const final = detail.trace?.find((step) => step.stepKey === 'pi:final' && step.status === 'succeeded');
  if (!run || run.status !== 'complete' || final?.refs?.runtime !== 'pi') continue;
  runs.set(run.id, {
    id: run.id, kind: run.kind, status: run.status, startedAt: run.createdAt, updatedAt: run.updatedAt,
    authority: { modeEpoch: final.refs.modeEpoch, privacyEpoch: final.refs.privacyEpoch, birthRevision: final.refs.birthRevision },
    tools: detail.trace.filter((step) => step.kind === 'tool').map((step) => ({ tool: step.toolName, status: step.status })),
    answers: detail.messages.filter((message) => message.runId === run.id && message.role === 'assistant')
      .map((message) => ({ bytes: Buffer.byteLength(message.content), sha256: createHash('sha256').update(message.content).digest('hex') })),
  });
}
if (runs.size !== 4) throw new Error(`Expected four completed Pi runs; found ${runs.size}.`);
const day = requests[0].startedDateTime.slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid proof date.');
const destination = `docs/qa/artifacts/${day}-pi-workspace`;
const privateDirectory = `.vercel/pi-proofs/${day}`;
mkdirSync(destination, { recursive: true });
mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
chmodSync(privateDirectory, 0o700);
chmodSync(trace, 0o600);
const privateTrace = join(privateDirectory, 'SENSITIVE-LOCAL-ONLY-after-auth-trace.zip');
copyFileSync(trace, privateTrace);
chmodSync(privateTrace, 0o600);
const screenshots = readdirSync(source).filter((name) => /^0[1-9]-[a-z0-9-]+\.png$/.test(name)).sort();
for (const name of screenshots) copyFileSync(join(source, name), join(destination, name));
writeFileSync(join(destination, 'proof.json'), JSON.stringify({
  preview: origins[0], status: 'passed', synthetic: true,
  viewports: [{ width: 1586, height: 992 }, { width: 1366, height: 768 }, { width: 390, height: 844 }],
  runs: [...runs.values()], screenshots,
  // No headers, query parameters, request/response bodies, cookies, or sessions.
  requests: requests.map((entry) => ({ method: entry.request.method, path: new URL(entry.request.url).pathname, status: entry.response.status })),
}, null, 2) + '\n');
console.log(JSON.stringify({ destination, screenshotCount: screenshots.length, completedPiRuns: runs.size, privateTrace }, null, 2));
