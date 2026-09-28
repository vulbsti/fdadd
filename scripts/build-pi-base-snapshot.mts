// Operator tool: build the Pi base snapshot (pinned Pi runtime, Atros, fd,
// ripgrep and jq; no user data) that per-person workspaces start from. Prints
// the snapshot ID to set as PI_BASE_SNAPSHOT_ID on staging and production. Requires Vercel Sandbox
// credentials (VERCEL_OIDC_TOKEN, or VERCEL_TOKEN + team/project IDs).
//
//   npx tsx scripts/build-pi-base-snapshot.mts
//
// Rebuild whenever runtime/pi changes: the runtime bundle hash is checked on
// every run, and a stale snapshot only costs a reinstall, never wrong code.
import { Sandbox } from '@vercel/sandbox';
import { ensureAtrosInstalled } from '../src/lib/astro/atros-commands';
import { installWorkspacePackages, piRuntimeBundleHash, readPiRuntimeFiles } from '../src/lib/astro/pi-runtime';
import { PI_INITIALIZATION_PROTOCOL } from '../src/lib/astro/pi-initialization';
import { ATROS_ENGINE_VERSION } from '../src/lib/astro/atros-commands';

const RUNTIME = '/vercel/sandbox/aidoraa/runtime';
const STATE = '/vercel/sandbox/aidoraa/state';

const files = await readPiRuntimeFiles();
const sandbox = await Sandbox.create({ image: 'vercel/sandbox/universal', timeout: 30 * 60 * 1000, persistent: false });
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
