import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore } from './agent-store';
import { ATROS_ENGINE_VERSION, ensureAtrosInstalled } from './atros-commands';
import { piArtifactPrefix, signPiAuthority } from './pi-authority';
import { assertPiAuthority, loadPiAuthority, loadPiFiles, readPiCheckpoint } from './pi-store';
import type { AstrologerRunEvent } from './contracts';
import { PI_INITIALIZATION_PROTOCOL, preparePiInitialization, withPiPreparationLock } from './pi-initialization';

const assets = ['package.json', 'package-lock.json', 'runner.mjs', 'extension.mjs', 'workspace-tools.mjs', 'person-context.md', 'atros.md'];
const ROOT = '/vercel/sandbox/aidoraa';
const WORKSPACE = `${ROOT}/workspace`;
const STATE = `${ROOT}/state`;
const RUNTIME = `${ROOT}/runtime`;
const READY_MARKER = `${STATE}/install-ready.json`;
const DATA_PHASE_MARKER = `${STATE}/private-data-phase`;
const PREPARATION_LOCK = `${STATE}/preparation.lock`;

export async function preparePiWorkspace(runId: string) {
  const authority = await loadPiAuthority(runId);
  const loaded = await loadPiFiles(authority);
  const runtimeFiles = await Promise.all(assets.map(async (name) => ({ path: `${RUNTIME}/${name}`, content: await fs.readFile(`${process.cwd()}/runtime/pi/${name}`, 'utf8') })));
  const bundle = createHash('sha256').update(runtimeFiles.map((file) => file.content).join('\n')).digest('hex').slice(0, 12);
  const identity = createHash('sha256').update(`${authority.userId}:${authority.personId}:${runId}:${authority.modeEpoch}:${authority.privacyEpoch}:${authority.birthRevision}:${bundle}:${PI_INITIALIZATION_PROTOCOL}:${ATROS_ENGINE_VERSION}`).digest('hex').slice(0, 32);
  const sandbox = await Sandbox.getOrCreate({
    name: `aidoraa-pi-${identity}`, image: 'vercel/sandbox/universal', timeout: 20 * 60 * 1000, persistent: false,
  });
  // Serialized through config commit, not merely through readiness probing.
  // An abandoned lock fails closed after a bounded wait; never remove another
  // invocation's lock or widen networking to recover it.
  return withPiPreparationLock({
    acquire: async () => {
      const lock = await sandbox.runCommand('bash', ['-lc',
        `mkdir -p '${STATE}' || exit 1; for attempt in $(seq 1 30); do if mkdir '${PREPARATION_LOCK}' 2>/dev/null; then exit 0; fi; sleep 1; done; exit 1`], { timeoutMs: 40_000 });
      return lock.exitCode === 0;
    },
    release: async () => {
      const released = await sandbox.runCommand('rmdir', [PREPARATION_LOCK]);
      if (released.exitCode !== 0) throw new Error('Could not release Pi sandbox preparation lock.');
    },
  }, async () => {
    const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.PI_BROKER_ORIGIN;
    if (!origin || new URL(origin).protocol !== 'https:') throw new Error('Pi requires a reachable HTTPS broker origin.');
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Missing runner signing configuration.');
    const token = signPiAuthority(authority, secret);
    const configPath = `${STATE}/runs/${runId}.json`;
    const readyMarker = JSON.stringify({ protocol: PI_INITIALIZATION_PROTOCOL, bundle,
      atros: loaded.birth ? ATROS_ENGINE_VERSION : null });
    const readInitializationState = async () => {
      const [config, phase, ready, existingFiles] = await Promise.all([
        sandbox.readFileToBuffer({ path: configPath }),
        sandbox.readFileToBuffer({ path: DATA_PHASE_MARKER }),
        sandbox.readFileToBuffer({ path: READY_MARKER }),
        sandbox.runCommand('bash', ['-lc', `for dir in '${WORKSPACE}' '${STATE}/sessions'; do if test -d "$dir"; then first=$(find "$dir" -mindepth 1 -print -quit) || exit 1; if test -n "$first"; then exit 42; fi; elif test -e "$dir"; then exit 1; fi; done`]),
      ]);
      if (![0, 42].includes(existingFiles.exitCode)) throw new Error('Cannot verify Pi sandbox private-data state.');
      return { prepared: config !== null, dataPhase: phase !== null, hasWorkspaceData: existingFiles.exitCode === 42,
        readyMarker: ready?.toString() ?? null };
    };
    const runtimeProbe = `import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
      const files = await Promise.all(${JSON.stringify(assets)}.map(name => readFile('${RUNTIME}/' + name, 'utf8')));
      if (createHash('sha256').update(files.join('\\n')).digest('hex').slice(0,12) !== '${bundle}') process.exit(1);
      const pkg = JSON.parse(await readFile('${RUNTIME}/node_modules/@earendil-works/pi-coding-agent/package.json','utf8'));
      if (pkg.version !== '0.87.1') process.exit(1);
      const api = await import('${RUNTIME}/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
      if (typeof api.RpcClient !== 'function') process.exit(1);
      await readFile('${RUNTIME}/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');`;
    const assertCleanForInstallation = async () => {
      const state = await readInitializationState();
      if (state.prepared || state.dataPhase || state.hasWorkspaceData) throw new Error('Refusing Pi installation after private data was written.');
    };
    // Broad install access exists only before user data is written. Restored
    // sandboxes never reopen broad networking. Secrets are injected outside VM.
    const initialized = await preparePiInitialization({ readyMarker, needsAtros: Boolean(loaded.birth) }, {
      readState: readInitializationState,
      runtimeReady: async () => (await sandbox.runCommand('node', ['--input-type=module', '-e', runtimeProbe])).exitCode === 0,
      atrosReady: async () => (await sandbox.runCommand('bash', ['-lc',
        `test -f '/tmp/atros-ready-${ATROS_ENGINE_VERSION.replace(/[^a-zA-Z0-9]/g, '-')}' && /tmp/atros-venv/bin/atros --version >/dev/null 2>&1`])).exitCode === 0,
      installRuntime: async () => {
        await assertCleanForInstallation();
        await sandbox.writeFiles(runtimeFiles);
        const install = await sandbox.runCommand('npm', ['ci', '--ignore-scripts', '--prefix', RUNTIME], { timeoutMs: 240000 });
        if (install.exitCode !== 0) throw new Error('Pinned Pi installation failed.');
      },
      installAtros: async () => { await assertCleanForInstallation(); await ensureAtrosInstalled(sandbox); },
      writeReadyMarker: async (marker) => { await sandbox.writeFiles([{ path: READY_MARKER, content: marker }]); },
      writeDataPhaseMarker: async () => { await sandbox.writeFiles([{ path: DATA_PHASE_MARKER, content: PI_INITIALIZATION_PROTOCOL }]); },
      sealNetwork: async () => { await sandbox.updateNetworkPolicy({ allow: { [new URL(origin).hostname]: [{
      match: { path: { startsWith: '/api/astrologer/pi/' }, method: ['POST'] },
      transform: [{ headers: {
        'x-aidoraa-run-capability': token,
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
      } }],
      }] } }); },
    });
    await assertPiAuthority(authority);
    // A replay must not rewrite a live runner's files. Each run owns its VM and
    // credentials; durable prior sessions are copied explicitly, never shared.
    if (initialized.alreadyPrepared) return { sandboxName: sandbox.name, configPath, authority };
    // Delete only the generated canonical view; preserve editable work and full
    // calculation artifacts in this same authority/birth namespace.
    const reset = await sandbox.runCommand('rm', ['-rf', `${WORKSPACE}/person`, `${WORKSPACE}/runtime-skills`]);
    if (reset.exitCode !== 0) throw new Error('Could not refresh canonical workspace files.');
    await sandbox.writeFiles([
      ...loaded.files.map((file) => ({ path: `${WORKSPACE}/${file.path}`, content: file.content })),
      { path: `${WORKSPACE}/runtime-skills/person-context.md`, content: runtimeFiles.find((file) => file.path.endsWith('/person-context.md'))!.content },
      ...(loaded.birth ? [{ path: `${WORKSPACE}/runtime-skills/atros.md`, content: runtimeFiles.find((file) => file.path.endsWith('/atros.md'))!.content }] : []),
    ]);
    const sessionDirectory = `${STATE}/sessions/${authority.sessionId}`;
    const admin = createAdminClient();
    const run = await new AgentStore(admin, admin).getRun(runId);
    const message = await admin.from('astro_messages').select('content').eq('id', run.triggering_message_id).eq('user_id', authority.userId).single();
    if (message.error || !message.data) throw new Error('Missing accepted user message.');
    // Immutable prior completion reference, scoped by session and authority;
    // recovery does not depend on the previous VM surviving.
    const priorRun = await admin.from('astro_agent_runs').select('id')
      .eq('session_id', authority.sessionId).eq('user_id', authority.userId).eq('profile_id', authority.personId)
      .eq('kind', 'question').eq('status', 'complete').order('completed_at', { ascending: false }).limit(1).maybeSingle();
    if (priorRun.error) throw new Error(`Could not inspect prior conversation run (${priorRun.error.code}).`);
    const previous = priorRun.data ? await admin.from('astro_agent_run_steps').select('refs')
      .eq('run_id', priorRun.data.id).eq('session_id', authority.sessionId).eq('user_id', authority.userId)
      .eq('profile_id', authority.personId).eq('step_key', 'pi:final').maybeSingle() : null;
    if (previous?.error) throw new Error(`Could not inspect prior Pi session checkpoint (${previous.error.code}).`);
    const refs = previous?.data?.refs;
    if (refs?.modeEpoch === authority.modeEpoch && refs?.privacyEpoch === authority.privacyEpoch && refs?.birthRevision === authority.birthRevision
        && typeof refs?.artifactPrefix === 'string' && refs.artifactPrefix.startsWith(`${authority.userId}/${authority.personId}/`)) {
      const checkpoint = await readPiCheckpoint({ ...authority, runId: refs.artifactPrefix.split('/').at(-1) });
      if (!checkpoint) throw new Error('Prior Pi session archive unavailable.');
      if (checkpoint.session) await sandbox.writeFiles([{ path: `${sessionDirectory}/restored.jsonl`, content: checkpoint.session }]);
      // Restore saved user artifacts and complete calculations after VM loss.
      const restorable = checkpoint.files.filter((file: { path: string }) => /^(work|proposals|outputs|astrology\/calculations)\//.test(file.path)
        && !/[\0\\]/.test(file.path) && !file.path.split('/').some((part) => ['', '.', '..'].includes(part)));
      await sandbox.writeFiles(restorable.map((file: { path: string; content: string }) => ({ path: `${WORKSPACE}/${file.path}`, content: file.content })));
    }
    await sandbox.writeFiles([{ path: configPath, content: JSON.stringify({
      runId, workspace: WORKSPACE, stateDirectory: STATE, sessionDirectory,
      broker: `${origin}/api/astrologer/pi`, astrologyEnabled: authority.astrologyEnabled,
      birth: loaded.birth, birthRevision: authority.birthRevision, authority,
      prompt: message.data.content, deadlineMs: 15 * 60 * 1000,
    }) }]);
    return { sandboxName: sandbox.name, configPath, authority };
  });
}

export async function startPiWorkspace(input: Awaited<ReturnType<typeof preparePiWorkspace>>) {
  const { authority } = input;
  await assertPiAuthority(authority);
  const completed = await readPiCheckpoint(authority);
  if (completed?.final) return;
  const sandbox = await Sandbox.get({ name: input.sandboxName });
  // Kernel lock also covers retries whose command-start acknowledgment was
  // lost. The runner restores its own durable partial checkpoint on startup.
  await sandbox.runCommand({ cmd: 'flock', args: ['-n', `${STATE}/runner.lock`, 'node', `${RUNTIME}/runner.mjs`, input.configPath], detached: true, timeoutMs: 16 * 60 * 1000 });
}

export async function pollPiWorkspace(input: Awaited<ReturnType<typeof preparePiWorkspace>>, cursor: number, emit: (event: AstrologerRunEvent) => Promise<void>) {
  const { authority } = input;
  await assertPiAuthority(authority);
  const checkpoint = await readPiCheckpoint(authority);
  const store = new AgentStore(createAdminClient(), createAdminClient());
  for (const event of (checkpoint?.events ?? []).slice(cursor)) {
      if (!['tool_execution_start', 'tool_execution_end'].includes(event.type ?? '') || !event.toolName || !event.toolCallId) continue;
      await assertPiAuthority(authority);
      const ended = event.type === 'tool_execution_end';
      const run = await store.getRun(authority.runId);
      await store.workerCheckpoint({ runId: run.id, expectedVersion: run.version, step: {
        stepKey: `pi:${event.toolCallId}:${ended ? 'end' : 'start'}`, kind: 'tool', status: ended ? event.isError ? 'failed' : 'succeeded' : 'started',
        toolName: event.toolName, outputSummary: ended ? event.isError ? 'tool failed' : 'complete result available in workspace' : 'tool started',
        refs: { runtime: 'pi', artifactPrefix: piArtifactPrefix(authority), ...event }, phase: 'analysis',
      } });
      await emit({ event: ended ? 'tool.completed' : 'tool.started', runId: run.id, phase: 'analysis', tool: event.toolName, summary: ended ? 'Workspace tool completed' : 'Working with your files and context' });
  }
  if (checkpoint?.final) return { done: true, cursor: checkpoint.events.length };
  const sandbox = await Sandbox.get({ name: input.sandboxName });
  const exit = await sandbox.readFileToBuffer({ path: `${STATE}/runs/${authority.runId}.exit` });
  if (exit || Date.now() >= authority.expiresAt - 10 * 60 * 1000) {
    console.error('[pi-workspace] runner stopped', { runId: authority.runId, exitCode: exit?.toString(), checkpointSequence: checkpoint?.sequence ?? 0 });
    throw new Error('Pi workspace paused or failed; its latest durable checkpoint is retained.');
  }
  return { done: false, cursor: checkpoint?.events.length ?? cursor };
}

export async function stopPiWorkspace(sandboxName: string) {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName, resume: false });
    await sandbox.stop();
  } catch {
    // Artifact/answer publication is already authoritative. Idle timeout also
    // stops this ephemeral VM; a cleanup error must not undo a completed answer.
    console.warn('[pi-workspace] sandbox stop unavailable', { sandboxName });
  }
}
