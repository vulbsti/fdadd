import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { RpcClient } from '@earendil-works/pi-coding-agent';
import { listWorkspace, workspacePath } from './workspace-tools.mjs';
import { createEventQueue, createLoopGuard, planCheckpointFiles, shouldCheckpoint } from './runner-state.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
async function startupFailure(error) {
  console.error(`Pi runner failed: ${error?.message ?? 'unknown error'}`);
  await writeFile(`${config.stateDirectory}/runs/${config.runId}.exit`, '1').catch(() => {});
  process.exit(1);
}
process.on('uncaughtException', startupFailure);
process.on('unhandledRejection', startupFailure);
const agentDir = `${config.stateDirectory}/agent`;
await mkdir(agentDir, { recursive: true });
await mkdir(config.sessionDirectory, { recursive: true });
const CHUNK_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 50 * CHUNK_BYTES;
const ARTIFACT_PATH = /^(work|proposals|outputs|astrology\/(hypotheses|calculations))\//;
// Digests already durable for this person. The VM is per person, so this
// survives between messages and unchanged files are never re-sent.
const uploadedPath = `${config.stateDirectory}/uploaded-blobs.json`;
const uploaded = new Set(JSON.parse(await readFile(uploadedPath, 'utf8').catch(() => '[]')));
async function saveUploaded() {
  await writeFile(uploadedPath, JSON.stringify([...uploaded]));
}

async function brokerJson(operation, body) {
  const response = await fetch(`${config.broker}/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`Workspace broker ${operation.split('/')[0]} rejected (${response.status}); no success was published.`);
  return response.json();
}
// With an edge store configured, bytes move in one request each and are
// stored once under their digest; the firewall adds the run's capability.
const edge = config.edge ?? null;
const digestOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function storeObject(key, bytes, contentType) {
  const response = await fetch(`${edge.origin}/o/${key}`, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
  if (!response.ok) throw new Error(`Workspace object store rejected a write (${response.status}); no success was published.`);
}
async function fetchObject(key, digest) {
  const response = await fetch(`${edge.origin}/o/${key}`);
  if (!response.ok) throw new Error(`Workspace object store read failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digestOf(bytes) !== digest) throw new Error('Recovered workspace object digest mismatch.');
  return bytes;
}
async function uploadBlob(blob) {
  if (edge) return storeObject(`${edge.prefix}/blobs/${blob.digest}`, blob.bytes, 'application/octet-stream');
  await brokerJson('blob/commit', await uploadTransfer(blob.bytes));
}
async function commitCheckpoint(bytes) {
  if (!edge) return brokerJson('checkpoint/commit', await uploadTransfer(bytes));
  const digest = digestOf(bytes);
  await storeObject(`${edge.prefix}/${config.runId}/${digest}.json`, bytes, 'application/json');
  await brokerJson('checkpoint/stored', { digest });
}
function isArtifactPath(value) {
  return typeof value === 'string' && ARTIFACT_PATH.test(value)
    && !/[\0\\]/.test(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
function transferManifest(bytes) {
  return { digest: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, parts: Math.ceil(bytes.length / CHUNK_BYTES) };
}
async function uploadTransfer(bytes) {
  const manifest = transferManifest(bytes);
  for (let index = 0; index < manifest.parts; index++) {
    const content = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString('base64');
    await brokerJson('checkpoint/part', { manifest, index, content });
  }
  return manifest;
}
async function downloadBlob(digest) {
  if (edge) return fetchObject(`${edge.prefix}/blobs/${digest}`, digest);
  const chunks = [];
  let parts = 1;
  for (let index = 0; index < parts; index++) {
    const received = await brokerJson(`restore/blob/${digest}/${index}`);
    parts = received.parts;
    chunks.push(Buffer.from(received.content, 'base64'));
  }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Recovered workspace file digest mismatch.');
  return bytes;
}

function decodeCheckpoint(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Durable recovery checkpoint could not be decoded.'); }
}
async function restoreCheckpoint() {
  if (edge) {
    const located = await brokerJson('restore/stored');
    if (!located) return null;
    if (typeof located.key !== 'string' || !located.key.startsWith(`${edge.prefix}/`) || !/^[a-f0-9]{64}$/.test(located.digest) || typeof located.sameRun !== 'boolean') {
      throw new Error('Invalid durable recovery location.');
    }
    return { checkpoint: decodeCheckpoint(await fetchObject(located.key, located.digest)), sameRun: located.sameRun };
  }
  const received = await brokerJson('restore');
  if (!received) return null;
  const { digest, byteLength, parts, sameRun } = received;
  if (!/^[a-f0-9]{64}$/.test(digest) || !Number.isInteger(byteLength) || byteLength <= 0 || byteLength > MAX_ARCHIVE_BYTES
    || !Number.isInteger(parts) || parts !== Math.ceil(byteLength / CHUNK_BYTES) || typeof sameRun !== 'boolean') {
    throw new Error('Invalid durable recovery transfer manifest.');
  }
  const manifest = { digest, byteLength, parts };
  const chunks = [];
  for (let index = 0; index < parts; index++) {
    const { content } = await brokerJson(`restore/${index}`, manifest);
    const bytes = Buffer.from(content, 'base64');
    if (bytes.length !== Math.min(CHUNK_BYTES, byteLength - index * CHUNK_BYTES)
      || bytes.toString('base64') !== content) throw new Error('Incomplete recovery transfer part.');
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks, byteLength);
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Recovery transfer digest mismatch.');
  return { checkpoint: decodeCheckpoint(bytes), sameRun };
}
const recovery = await restoreCheckpoint();
if (recovery?.checkpoint?.final && recovery.sameRun) process.exit(0);
if (recovery?.checkpoint) {
  const saved = recovery.checkpoint;
  if (saved.session) await writeFile(`${config.sessionDirectory}/restored.jsonl`, saved.session);
  for (const file of saved.files) {
    if (!isArtifactPath(file.path)) throw new Error('Invalid recovery artifact path.');
    const destination = path.join(config.workspace, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (typeof file.digest === 'string') {
      await writeFile(destination, await downloadBlob(file.digest));
      uploaded.add(file.digest);
    } else {
      await writeFile(destination, file.content);
    }
  }
  await saveUploaded();
}

await writeFile(`${agentDir}/models.json`, JSON.stringify({ providers: { aidoraa: {
  api: 'openai-responses', baseUrl: `${config.broker}/model`, apiKey: 'brokered-outside-sandbox',
  models: [{ id: 'gpt-6-luna', name: 'Luna', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 16000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
} } }));
await writeFile(`${agentDir}/settings.json`, JSON.stringify({ defaultThinkingLevel: 'high', transport: 'sse', cacheWarming: 'off', compaction: { enabled: true }, retry: { enabled: true } }));
const capabilities = config.astrologyEnabled
  ? (config.birth ? 'Astrology is enabled and their birth chart is calculated.' : 'Astrology is enabled, but their birth details are not saved yet, so there is no chart.')
  : 'Astrology is turned off for this person: work only with their life and their words.';
// The trusted prompt replaces Pi's default coding-assistant preamble. Facts
// that change per run go in the addendum.
const context = [`Today is ${config.today}.`, capabilities,
  `This conversation is \`history/${config.historyFile}\`; earlier conversations are listed in \`history/index.md\`.`].join(' ');
const existing = (await readdir(config.sessionDirectory)).filter((file) => file.endsWith('.jsonl')).sort();
const skills = ['person-context', ...(config.astrologyEnabled && config.birth ? ['chart-reading', 'rectify'] : [])];
const tools = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'person_state', 'ask_person',
  ...(config.astrologyEnabled && config.birth ? ['recalculate'] : [])];
const client = new RpcClient({
  cliPath: `${directory}/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`, cwd: config.workspace,
  provider: 'aidoraa', model: 'gpt-6-luna',
  env: { PI_CODING_AGENT_DIR: agentDir, AIDORAA_RUN_CONFIG: process.argv[2], PI_SKIP_VERSION_CHECK: '1', PI_OFFLINE: '1' },
  // Discovery stays off so user files can never install extensions, skills or
  // context files; the trusted runtime bundle is loaded by explicit path.
  // --no-approve also ignores any .pi/ folder the agent's shell may create in
  // the workspace, so nothing written there loads on a later message.
  args: ['--no-approve', '--no-extensions', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-themes',
    '-e', `${directory}/extension.mjs`, ...skills.flatMap((name) => ['--skill', `${directory}/skills/${name}`]),
    '--tools', tools.join(','), '--session-dir', config.sessionDirectory,
    ...(existing.length ? ['--session', path.join(config.sessionDirectory, existing.at(-1))] : []),
    '--system-prompt', `${directory}/system-prompt.md`, '--append-system-prompt', context],
});

// With an edge stream, text goes straight to it and on to the browser; only
// tool lifecycle and exit rows still go to the broker, which records them
// durably. If the edge is unreachable the whole batch takes the broker path.
async function sendLive(events) {
  if (edge) {
    try {
      const response = await fetch(`${edge.origin}/runs/${config.runId}/events`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`edge stream ${response.status}`);
      events = events.filter((event) => event.kind !== 'text_delta');
      if (!events.length) return;
    } catch (error) {
      console.error(`Live stream fell back to the broker: ${error.message}`);
    }
  }
  await brokerJson('events', { events });
}
const live = createEventQueue(sendLive);
const flushTimer = setInterval(() => { void live.flush().catch((error) => console.error(error.message)); }, edge ? 250 : 400);
const guard = createLoopGuard();
let stopReason = null;
let segment = 0;
let checkpointQueue = Promise.resolve();
let checkpointSequence = recovery?.sameRun ? recovery.checkpoint.sequence : 0;
let lastCheckpointAt = 0;
let lastAssistant = null;
const publicEvents = recovery?.sameRun ? recovery.checkpoint.events : [];

async function checkpoint(final = false) {
  const sessions = (await readdir(config.sessionDirectory)).filter((file) => file.endsWith('.jsonl')).sort();
  const files = [];
  for (const relative of await listWorkspace(config.workspace)) {
    if (!ARTIFACT_PATH.test(relative)) continue;
    files.push({ path: relative, bytes: await readFile(await workspacePath(config.workspace, relative)) });
  }
  const plan = planCheckpointFiles(files, uploaded);
  for (const blob of plan.toUpload) {
    await uploadBlob(blob);
    uploaded.add(blob.digest);
  }
  if (plan.toUpload.length) await saveUploaded();
  const session = sessions.length ? await readFile(path.join(config.sessionDirectory, sessions.at(-1)), 'utf8') : '';
  const question = final ? JSON.parse(await readFile(`${config.stateDirectory}/runs/${config.runId}.question.json`, 'utf8').catch(() => 'null')) : null;
  const bytes = Buffer.from(JSON.stringify({ sequence: ++checkpointSequence, final, session, files: plan.entries, events: publicEvents, answer: final ? lastAssistant : null, question }));
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Checkpoint exceeds the prototype 50 MiB archive budget; no data was truncated.');
  await commitCheckpoint(bytes);
  lastCheckpointAt = Date.now();
}
function queueCheckpoint(trigger) {
  if (!shouldCheckpoint(trigger, lastCheckpointAt, Date.now())) return;
  lastCheckpointAt = Date.now();
  checkpointQueue = checkpointQueue.then(() => checkpoint()).catch((error) => { console.error(error.message); throw error; });
  // Mark as observed until awaited at completion; failed persistence is fatal there.
  void checkpointQueue.catch(() => {});
}
function stopForNoProgress(reason) {
  if (stopReason) return;
  stopReason = `Stopped because ${reason}; saved work is kept for a retry.`;
  void client.abort().catch(() => {});
}

client.onEvent((event) => {
  if (event.type === 'message_start' && event.message?.role === 'assistant') segment += 1;
  if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta' && event.assistantMessageEvent.delta) {
    live.push({ kind: 'text_delta', segment, text: event.assistantMessageEvent.delta });
  }
  if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
    const ended = event.type === 'tool_execution_end';
    const safe = { type: event.type, toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError === true };
    publicEvents.push(safe);
    live.push({ kind: ended ? 'tool_end' : 'tool_start', toolName: event.toolName, toolCallId: String(event.toolCallId).slice(0, 200), isError: safe.isError });
    const verdict = ended ? guard.ended(safe.isError) : guard.started(event.toolName, event.args);
    if (verdict.action === 'stop') stopForNoProgress(verdict.reason);
    if (verdict.action === 'warn') {
      void client.steer(`Progress check: ${verdict.reason}. Change approach: read the saved results or errors, try a different method, or answer with what you have and say what is missing.`).catch(() => {});
    }
  }
  if (event.type === 'message_end' && event.message?.role === 'assistant') {
    lastAssistant = event.message;
  }
  if (event.type === 'turn_end') queueCheckpoint(event.type);
});

// A conversation that began before this Pi session existed (a restored
// workspace or an older chat) starts with its earlier turns as context.
function firstPrompt() {
  if (existing.length || !config.conversation?.length) return config.prompt;
  const earlier = config.conversation.map((m) => `${m.role === 'user' ? 'Person' : 'You (Aidoraa)'}: ${m.content}`).join('\n\n');
  return `Earlier in this conversation (also in history/${config.historyFile}):\n\n${earlier}\n\n---\n\n${config.prompt}`;
}

let exitCode = 0;
try {
  await client.start();
  await client.promptAndWait(recovery?.checkpoint?.session
    ? 'Continue the interrupted accepted request from the saved session. Inspect saved tool results and working files before repeating work; finish the answer. Current capabilities are authoritative.'
    : firstPrompt(), undefined, config.deadlineMs);
  await checkpointQueue;
  if (stopReason) throw new Error(stopReason);
  if (!lastAssistant || ['error', 'aborted', 'length', 'toolUse'].includes(lastAssistant.stopReason)) throw new Error('Pi stopped without a complete final answer.');
  const answer = (lastAssistant.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join('\n').trim();
  if (!answer) throw new Error('Pi returned no final answer.');
  await mkdir(`${config.workspace}/outputs/${config.runId}`, { recursive: true });
  await writeFile(`${config.workspace}/outputs/${config.runId}/answer.md`, answer);
  await checkpoint(true);
  console.log(JSON.stringify({ type: 'workspace.completed', runId: config.runId }));
} catch (error) {
  await client.abort().catch(() => {});
  await checkpointQueue.catch(() => {});
  await checkpoint().catch(() => {});
  console.error(`Pi workspace stopped: ${error.message}`);
  exitCode = 1;
} finally {
  clearInterval(flushTimer);
  live.push({ kind: 'exit', isError: exitCode !== 0 });
  await live.flush().catch(() => {});
  await client.stop();
  await writeFile(`${config.stateDirectory}/runs/${config.runId}.exit`, String(exitCode));
  process.exitCode = exitCode;
}
