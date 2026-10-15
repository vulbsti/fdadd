// Operator tool: build the Pi base snapshot (pinned Pi runtime, Atros, fd,
// ripgrep and jq; no user data) that per-person workspaces start from. Prints
// the snapshot ID to set as PI_BASE_SNAPSHOT_ID on staging and production. Requires Vercel Sandbox
// credentials (VERCEL_OIDC_TOKEN, or VERCEL_TOKEN + VERCEL_ORG_ID + VERCEL_PROJECT_ID).
//
//   npx tsx scripts/build-pi-base-snapshot.mts
//
// The "Rebuild Pi base snapshot" workflow runs this in CI and sets the result
// on Vercel for you.
//
// Rebuild whenever runtime/pi changes: the runtime bundle hash is checked on
// every run, and a stale snapshot only costs a reinstall, never wrong code.
import { Sandbox } from '@vercel/sandbox';
// The app modules compile to CommonJS under tsx, where named ESM imports of
// some exports fail; read them from the module object instead.
import atrosCommands from '../src/lib/astro/atros-commands';
import piRuntime from '../src/lib/astro/pi-runtime';
import piInitialization from '../src/lib/astro/pi-initialization';

const { ensureAtrosInstalled, ATROS_ENGINE_VERSION } = atrosCommands;
const { installWorkspacePackages, piRuntimeBundleHash, readPiRuntimeFiles } = piRuntime;
const { PI_INITIALIZATION_PROTOCOL } = piInitialization;

const RUNTIME = '/vercel/sandbox/aidoraa/runtime';
const STATE = '/vercel/sandbox/aidoraa/state';

const files = await readPiRuntimeFiles();
// CI has a Vercel API token rather than an OIDC token.
const credentials = process.env.VERCEL_TOKEN && process.env.VERCEL_ORG_ID && process.env.VERCEL_PROJECT_ID
  ? { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_ORG_ID, projectId: process.env.VERCEL_PROJECT_ID }
  : {};
const sandbox = await Sandbox.create({ ...credentials, image: 'vercel/sandbox/universal', timeout: 30 * 60 * 1000, persistent: false });
try {
  await sandbox.writeFiles(files);
  const install = await sandbox.runCommand('npm', ['ci', '--ignore-scripts', '--prefix', RUNTIME], { timeoutMs: 240_000 });
  if (install.exitCode !== 0) throw new Error('Pinned Pi installation failed.');
  // fd, ripgrep and jq: Pi's find/grep and the agent's shell need them, and the
  // sealed per-person VM cannot download them later.
  await installWorkspacePackages(sandbox);
  await ensureAtrosInstalled(sandbox);
  // Same marker shape preparePiWorkspace expects for a VM with birth data.
  await sandbox.writeFiles([{ path: `${STATE}/install-ready.json`, content: JSON.stringify({
    protocol: PI_INITIALIZATION_PROTOCOL, bundle: piRuntimeBundleHash(files), atros: ATROS_ENGINE_VERSION,
  }) }]);
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(JSON.stringify({ PI_BASE_SNAPSHOT_ID: snapshot.snapshotId, bundle: piRuntimeBundleHash(files) }));
} catch (error) {
  await sandbox.stop().catch(() => {});
  throw error;
}
