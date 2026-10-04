// Explicit operator tool: remove Pi workspace leftovers written before
// checkpoints were pruned as they were saved. Dry-run by default.
//
//   node scripts/cleanup-pi-storage.mjs staging|production [--apply]
//
// Removes, for runs that are no longer active: staged transfer pieces,
// checkpoint archives superseded by a newer one (with their receipts), and
// live event rows. Content-addressed file blobs and each run's latest
// checkpoint are never touched. On staging it also trims the pg_cron run log
// and schedules a daily trim. Credentials stay in process memory.
import { execFileSync } from 'node:child_process';
import https from 'node:https';

/** Decide what to remove from the bucket listing and the receipts. Pure, so it can be reasoned about. */
export function planCleanup({ objects, receipts, activeRuns }) {
  const latest = new Map();
  for (const receipt of receipts) {
    const current = latest.get(receipt.run_id);
    if (!current || Number(receipt.sequence) > Number(current.sequence)) latest.set(receipt.run_id, receipt);
  }
  const keep = new Set([...latest.values()].map((receipt) => receipt.object_path));
  const remove = [];
  for (const object of objects) {
    const parts = object.name.split('/');
    // <user>/<person>/blobs/<digest> is shared by every checkpoint of a person.
    if (parts[2] === 'blobs' || activeRuns.has(parts[2])) continue;
    const staged = parts[3] === 'transfer';
    const archive = parts.length === 4 && /^[a-f0-9]{64}\.json$/.test(parts[3]);
    if (staged || (archive && !keep.has(object.name))) remove.push({ ...object, kind: staged ? 'transfer' : 'checkpoint' });
  }
  const receiptsToDelete = receipts.filter((receipt) => !activeRuns.has(receipt.run_id)
    && Number(receipt.sequence) < Number(latest.get(receipt.run_id).sequence));
  return { remove, receiptsToDelete };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refs = { staging: 'wtloawiwntyjiidjbmuk', production: 'ezanfqbewuqttatrkvhf' };
  const target = process.argv[2];
  if (!refs[target] || process.argv.slice(3).some((flag) => flag !== '--apply')) {
    throw new Error('Usage: node scripts/cleanup-pi-storage.mjs staging|production [--apply]');
  }
  const apply = process.argv.includes('--apply');
  const ref = refs[target];
  const BUCKET = 'pi-workspaces';
  const query = (sql) => JSON.parse(execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--project-ref', ref, sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  })).rows;
  const objects = query(`select name, coalesce((metadata->>'size')::bigint, 0) as bytes from storage.objects where bucket_id = '${BUCKET}'`);
  const receipts = query('select run_id, sequence, object_path from public.pi_workspace_checkpoints');
  const activeRuns = new Set(query("select id from public.astro_agent_runs where status = 'active'").map((row) => row.id));
  const events = query("select count(*)::int as rows from public.pi_run_events e where not exists (select 1 from public.astro_agent_runs r where r.id = e.run_id and r.status = 'active')")[0].rows;
  const { remove, receiptsToDelete } = planCleanup({ objects, receipts, activeRuns });
  const total = (kind) => remove.filter((object) => object.kind === kind).reduce((sum, object) => sum + Number(object.bytes), 0);
  const count = (kind) => remove.filter((object) => object.kind === kind).length;
  const cron = target === 'staging' ? query("select count(*)::int as rows, pg_total_relation_size('cron.job_run_details')::bigint as bytes from cron.job_run_details")[0] : null;
  console.log(JSON.stringify({ target, ref, apply,
    bucket: { objects: objects.length, bytes: objects.reduce((sum, object) => sum + Number(object.bytes), 0) },
    remove: { transferPieces: count('transfer'), transferBytes: total('transfer'), supersededCheckpoints: count('checkpoint'), checkpointBytes: total('checkpoint'),
      receipts: receiptsToDelete.length, liveEventRows: events },
    skippedActiveRuns: activeRuns.size, cronRunLog: cron }, null, 2));

  if (apply) {
    const keys = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const secret = keys.find((entry) => entry.type === 'secret')?.api_key ?? keys.find((entry) => entry.name === 'service_role')?.api_key;
    if (!secret) throw new Error('No server key available for this project.');
    const host = `${ref}.supabase.co`;
    // Some networks answer DNS for the project host with a wrong address; ask a public resolver instead.
    const answer = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: 'application/dns-json' } })
      .then((response) => response.json()).catch(() => null);
    const address = answer?.Answer?.find((entry) => entry.type === 1)?.data;
    const removeObjects = (prefixes) => new Promise((resolve, reject) => {
      const body = JSON.stringify({ prefixes });
      const request = https.request({ host, path: `/storage/v1/object/${BUCKET}`, method: 'DELETE',
        headers: { authorization: `Bearer ${secret}`, apikey: secret, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        ...(address ? { lookup: (_name, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4) } : {}),
      }, (response) => {
        response.resume();
        response.on('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`Storage removal failed (${response.statusCode}).`)));
      });
      request.on('error', reject);
      request.end(body);
    });
    for (let index = 0; index < remove.length; index += 100) {
      await removeObjects(remove.slice(index, index + 100).map((object) => object.name));
    }
    // Objects first: a receipt is only dropped once its archive is gone.
    query(`delete from public.pi_workspace_checkpoints c using (
        select run_id, max(sequence) as latest from public.pi_workspace_checkpoints group by run_id) m
      where c.run_id = m.run_id and c.sequence < m.latest
        and not exists (select 1 from public.astro_agent_runs r where r.id = c.run_id and r.status = 'active')`);
    query("delete from public.pi_run_events e where not exists (select 1 from public.astro_agent_runs r where r.id = e.run_id and r.status = 'active')");
    if (target === 'staging') {
      query("delete from cron.job_run_details where end_time < now() - interval '1 day'");
      query(`select cron.schedule('aidoraa-staging-trim-cron-log', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$)`);
    }
    console.log(`Removed ${remove.length} objects and ${receiptsToDelete.length} receipts from ${target}.`);
  }
}
