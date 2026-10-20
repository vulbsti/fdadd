// Point Preview and Production at a freshly built Pi base snapshot and delete
// the one before last. The previous snapshot is kept because the live
// deployment keeps using it until the next deploy picks up the new ID.
//
//   VERCEL_TOKEN=… VERCEL_ORG_ID=… VERCEL_PROJECT_ID=… node scripts/rotate-pi-base-snapshot.mjs snap_…
import { Snapshot } from '@vercel/sandbox';

const [snapshotId] = process.argv.slice(2);
const { VERCEL_TOKEN: token, VERCEL_ORG_ID: teamId, VERCEL_PROJECT_ID: projectId } = process.env;
if (!/^snap_[A-Za-z0-9_-]+$/.test(snapshotId ?? '')) throw new Error('Usage: rotate-pi-base-snapshot.mjs <snapshot id>');
if (!token || !teamId || !projectId) throw new Error('VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID are required.');

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${teamId}`, {
    ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Vercel API ${path.split('?')[0]} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
};

const { envs } = await api(`/v10/projects/${projectId}/env?decrypt=true`);
const productionValue = (key) => envs.find((env) => env.key === key && env.target?.includes('production'))?.value?.trim() || null;
const current = productionValue('PI_BASE_SNAPSHOT_ID');
const previous = productionValue('PI_BASE_SNAPSHOT_PREVIOUS_ID');

const upsert = (key, value) => api(`/v10/projects/${projectId}/env?upsert=true`, {
  method: 'POST', body: JSON.stringify({ key, value, type: 'encrypted', target: ['preview', 'production'] }),
});
await upsert('PI_BASE_SNAPSHOT_ID', snapshotId);
if (current && current !== snapshotId) await upsert('PI_BASE_SNAPSHOT_PREVIOUS_ID', current);
console.log(`PI_BASE_SNAPSHOT_ID=${snapshotId} is set on Preview and Production; it applies from the next deploy.`);

// Only the snapshot two builds back is deleted; it is no longer in any env var.
if (previous && ![snapshotId, current].includes(previous)) {
  try {
    await (await Snapshot.get({ snapshotId: previous, token, teamId, projectId })).delete();
    console.log(`Deleted the older base snapshot ${previous}.`);
  } catch (error) {
    console.warn(`Could not delete the older base snapshot ${previous}: ${error instanceof Error ? error.message : error}`);
  }
}
