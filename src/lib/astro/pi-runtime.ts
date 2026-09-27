import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgentStore } from './agent-store';
import { ATROS_ENGINE_VERSION, ensureAtrosInstalled } from './atros-commands';
import { piArtifactPrefix, signPiAuthority, type PiAuthority } from './pi-authority';
import { assertPiAuthority, hasFinalPiCheckpoint, loadPiAuthority, loadPiFiles, readPiCheckpoint, readPiRunEvents,
  resolvePiCheckpointFiles } from './pi-store';
import type { AstrologerRunEvent } from './contracts';
import { PI_INITIALIZATION_PROTOCOL, preparePiInitialization, withPiPreparationLock } from './pi-initialization';

export const PI_RUNTIME_ASSETS = ['package.json', 'package-lock.json', 'runner.mjs', 'runner-state.mjs', 'extension.mjs', 'workspace-tools.mjs',
  'skills/person-context/SKILL.md', 'skills/atros/SKILL.md'];
const ROOT = '/vercel/sandbox/aidoraa';
const WORKSPACE = `${ROOT}/workspace`;
const STATE = `${ROOT}/state`;
const RUNTIME = `${ROOT}/runtime`;
const READY_MARKER = `${STATE}/install-ready.json`;
const DATA_PHASE_MARKER = `${STATE}/private-data-phase`;
const PREPARATION_LOCK = `${STATE}/preparation.lock`;
// A per-person VM stays warm between messages. Each run tops up its lifetime;
// an idle VM expires on its own and is rebuilt from durable storage.
const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
const RUN_TIMEOUT_EXTENSION_MS = 20 * 60 * 1000;

export async function readPiRuntimeFiles() {
  return Promise.all(PI_RUNTIME_ASSETS.map(async (name) => ({
    path: `${RUNTIME}/${name}`,
    content: await fs.readFile(`${process.cwd()}/runtime/pi/${name}`, 'utf8'),
  })));
}

export function piRuntimeBundleHash(files: Array<{ content: string }>) {
  return createHash('sha256').update(files.map((file) => file.content).join('\n')).digest('hex').slice(0, 12);
}

/**
 * One sandbox per person and authority state, not per run. Changing consent,
 * privacy, birth data or the runtime bundle yields a different VM, so a
 * running VM never has its permissions widened in place.
 */
export function piSandboxName(authority: Pick<PiAuthority, 'userId' | 'personId' | 'modeEpoch' | 'privacyEpoch' | 'birthRevision' | 'astrologyEnabled'>, bundle: string) {
  const identity = createHash('sha256').update([authority.userId, authority.personId, authority.modeEpoch, authority.privacyEpoch,
    authority.birthRevision, authority.astrologyEnabled, bundle, PI_INITIALIZATION_PROTOCOL, ATROS_ENGINE_VERSION].join(':')).digest('hex').slice(0, 32);
  return `aidoraa-pi-person-${identity}`;
}

function sandboxSource() {
  // A prebuilt base (Pi + Atros, no user data) from scripts/build-pi-base-snapshot.mjs.
  const snapshotId = process.env.PI_BASE_SNAPSHOT_ID?.trim();
  return snapshotId ? { source: { type: 'snapshot' as const, snapshotId } } : { image: 'vercel/sandbox/universal' };
}

export async function preparePiWorkspace(runId: string) {
  const authority = await loadPiAuthority(runId);
  const loaded = await loadPiFiles(authority);
  const runtimeFiles = await readPiRuntimeFiles();
  const bundle = piRuntimeBundleHash(runtimeFiles);
  const sandbox = await Sandbox.getOrCreate({
    name: piSandboxName(authority, bundle), timeout: SANDBOX_TIMEOUT_MS, persistent: false, ...sandboxSource(),
  });
  await sandbox.extendTimeout(RUN_TIMEOUT_EXTENSION_MS).catch(() => {
    // Plan limits can refuse an extension; the run deadline still fits the base timeout.
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
      const files = await Promise.all(${JSON.stringify(PI_RUNTIME_ASSETS)}.map(name => readFile('${RUNTIME}/' + name, 'utf8')));
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
    // Broad install access exists only before user data is written. A VM made
    // from the base snapshot is already installed and skips this entirely.
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
      sealNetwork: async () => {
        // The per-person VM outlives runs. Stop any earlier runner first, so the
        // capability injected below can only be used by this run's processes.
        // The bracket keeps the pattern from matching this shell's own command line.
        const processes = `[${RUNTIME[0]}]${RUNTIME.slice(1)}/`;
        const stopped = await sandbox.runCommand('bash', ['-lc', `pkill -f '${processes}'; for attempt in $(seq 1 20); do pgrep -f '${processes}' >/dev/null || exit 0; sleep 0.5; done; pkill -9 -f '${processes}'; sleep 0.5; ! pgrep -f '${processes}' >/dev/null`]);
        if (stopped.exitCode !== 0) throw new Error('An earlier Pi runner is still running in this workspace.');
        await sandbox.updateNetworkPolicy({ allow: { [new URL(origin).hostname]: [{
          match: { path: { startsWith: '/api/astrologer/pi/' }, method: ['POST'] },
          transform: [{ headers: {
            'x-aidoraa-run-capability': token,
            ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
          } }],
        }] } });
      },
    });
    await assertPiAuthority(authority);
    // A replay must not rewrite a live runner's files.
    if (initialized.alreadyPrepared) return { sandboxName: sandbox.name, configPath, authority };
    if (!authority.astrologyEnabled) {
      // A shell can reach anything on disk, so a disabled person gets no engine
      // at all, not just a hidden tool. This VM identity never re-enables it.
      const removed = await sandbox.runCommand('rm', ['-rf', '/tmp/atros-venv', '/tmp/atros-src', `${WORKSPACE}/astrology`]);
      if (removed.exitCode !== 0) throw new Error('Could not remove astrology tooling from a personal-only workspace.');
    }
    // Refresh only the generated canonical view; editable work and complete
    // calculation artifacts persist in the VM between messages.
    const reset = await sandbox.runCommand('rm', ['-rf', `${WORKSPACE}/person`, `${WORKSPACE}/manifest.json`, `${WORKSPACE}/runtime-skills`]);
    if (reset.exitCode !== 0) throw new Error('Could not refresh canonical workspace files.');
    await sandbox.writeFiles(loaded.files.map((file) => ({ path: `${WORKSPACE}/${file.path}`, content: file.content })));
    const sessionDirectory = `${STATE}/sessions/${authority.sessionId}`;
    const admin = createAdminClient();
    const run = await new AgentStore(admin, admin).getRun(runId);
    const message = await admin.from('astro_messages').select('content').eq('id', run.triggering_message_id).eq('user_id', authority.userId).single();
    if (message.error || !message.data) throw new Error('Missing accepted user message.');
    const warmSession = await sandbox.runCommand('bash', ['-lc', `ls '${sessionDirectory}'/*.jsonl >/dev/null 2>&1`]);
    if (warmSession.exitCode !== 0) {
      // Cold VM (first message, expiry or crash): restore the latest completed
      // run of this chat from durable storage. A warm VM already has it.
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
        const restorable = (await resolvePiCheckpointFiles(authority, checkpoint)).filter((file) => /^(work|proposals|outputs|astrology\/calculations)\//.test(file.path)
          && !/[\0\\]/.test(file.path) && !file.path.split('/').some((part) => ['', '.', '..'].includes(part))
          && (authority.astrologyEnabled || !file.path.startsWith('astrology/')));
        await sandbox.writeFiles(restorable.map((file) => ({ path: `${WORKSPACE}/${file.path}`, content: file.content })));
      }
    }
    await sandbox.writeFiles([{ path: configPath, content: JSON.stringify({
      runId, workspace: WORKSPACE, stateDirectory: STATE, sessionDirectory,
      broker: `${origin}/api/astrologer/pi`, astrologyEnabled: authority.astrologyEnabled,
      birth: loaded.birth, birthRevision: authority.birthRevision,
      prompt: message.data.content, deadlineMs: 15 * 60 * 1000,
    }) }]);
    return { sandboxName: sandbox.name, configPath, authority };
  });
}

export async function startPiWorkspace(input: Awaited<ReturnType<typeof preparePiWorkspace>>) {
  const { authority } = input;
  await assertPiAuthority(authority);
  if (await hasFinalPiCheckpoint(authority)) return;
  const sandbox = await Sandbox.get({ name: input.sandboxName });
  // Kernel lock also covers retries whose command-start acknowledgment was
  // lost. The runner restores its own durable partial checkpoint on startup.
  await sandbox.runCommand({ cmd: 'flock', args: ['-n', `${STATE}/runner.lock`, 'node', `${RUNTIME}/runner.mjs`, input.configPath], detached: true, timeoutMs: 16 * 60 * 1000 });
}

export interface PiPollProgress { done: boolean; cursor: number; exited: boolean }

/**
 * Forward new live events (tool lifecycle, coalesced text) to the run stream.
 * Reads small database rows; the checkpoint archive is never downloaded here.
 */
export async function pollPiWorkspace(input: Awaited<ReturnType<typeof preparePiWorkspace>>, cursor: number,
  emit: (event: AstrologerRunEvent) => Promise<void>, options: { probeSandbox?: boolean } = {}): Promise<PiPollProgress> {
  const { authority } = input;
  await assertPiAuthority(authority);
  const events = await readPiRunEvents(authority, cursor);
  const store = new AgentStore(createAdminClient(), createAdminClient());
  let exited = false;
  // Adjacent text rows of one message segment become one stream event.
  const pending: { text: { segment: number; delta: string } | null } = { text: null };
  const flushText = async () => {
    const text = pending.text;
    if (!text) return;
    pending.text = null;
    await emit({ event: 'answer.delta', runId: authority.runId, phase: 'responding', segment: text.segment, delta: text.delta });
  };
  for (const event of events) {
    if (event.kind === 'text_delta') {
      const text = pending.text;
      if (text && (text.segment !== event.segment || text.delta.length + (event.text?.length ?? 0) > 16000)) await flushText();
      pending.text = { segment: event.segment, delta: `${pending.text?.delta ?? ''}${event.text ?? ''}` };
      continue;
    }
    await flushText();
    if (event.kind === 'exit') { exited = true; continue; }
    if (!event.toolName || !event.toolCallId) continue;
    const ended = event.kind === 'tool_end';
    const run = await store.getRun(authority.runId);
    await store.workerCheckpoint({ runId: run.id, expectedVersion: run.version, step: {
      stepKey: `pi:${event.toolCallId}:${ended ? 'end' : 'start'}`, kind: 'tool', status: ended ? event.isError ? 'failed' : 'succeeded' : 'started',
      toolName: event.toolName, outputSummary: ended ? event.isError ? 'tool failed' : 'complete result available in workspace' : 'tool started',
      refs: { runtime: 'pi', artifactPrefix: piArtifactPrefix(authority), type: ended ? 'tool_execution_end' : 'tool_execution_start',
        toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError }, phase: 'analysis',
    } });
    await emit({ event: ended ? 'tool.completed' : 'tool.started', runId: run.id, phase: 'analysis', tool: event.toolName, summary: ended ? 'Workspace tool completed' : 'Working with your files and context' });
  }
  await flushText();
  const nextCursor = events.at(-1)?.seq ?? cursor;
  if (await hasFinalPiCheckpoint(authority)) return { done: true, cursor: nextCursor, exited };
  let crashed = false;
  if (!exited && options.probeSandbox) {
    // A killed runner cannot report its exit; check the VM occasionally.
    const sandbox = await Sandbox.get({ name: input.sandboxName });
    crashed = (await sandbox.readFileToBuffer({ path: `${STATE}/runs/${authority.runId}.exit` })) !== null;
  }
  if (exited || crashed || Date.now() >= authority.expiresAt - 10 * 60 * 1000) {
    console.error('[pi-workspace] runner stopped', { runId: authority.runId, cursor: nextCursor });
    throw new Error('Pi workspace paused or failed; its latest durable checkpoint is retained.');
  }
  return { done: false, cursor: nextCursor, exited };
}
