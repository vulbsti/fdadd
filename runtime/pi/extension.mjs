import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { listWorkspace, readWorkspace, searchWorkspace, writeWorkspace } from './workspace-tools.mjs';

const execute = promisify(execFile);
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], details: {} });
const str = { type: 'string' };
const integer = { type: 'integer', minimum: 0 };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export default async function aidoraaWorkspace(pi) {
  const config = JSON.parse(await readFile(process.env.AIDORAA_RUN_CONFIG, 'utf8'));
  const root = config.workspace;
  async function current() {
    const response = await fetch(`${config.broker}/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Workspace authority changed or expired; restart with current settings.');
    return response.json();
  }
  const tool = (name, description, parameters, handler) => pi.registerTool({
    name, label: name, description, parameters,
    async execute(_id, args) { await current(); return text(await handler(args, _id)); },
  });
  tool('workspace_list', 'List real workspace files. Use the returned nextOffset to continue; nothing is deleted by pagination.', object({ offset: integer }), async ({ offset = 0 }) => {
    const files = await listWorkspace(root);
    return { files: files.slice(offset, offset + 100), total: files.length, nextOffset: offset + 100 < files.length ? offset + 100 : null };
  });
  tool('workspace_read', 'Read complete lines from a real Markdown/JSON/source/calculation file. Continue with nextOffset until required evidence is covered.', object({ path: str, offset: integer, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, ['path']), ({ path: file, offset, limit }) => readWorkspace(root, file, offset, limit));
  tool('workspace_search', 'Literal case-insensitive search across all permitted Markdown and structured JSON files. Hits include path and line; read source files for full context.', object({ query: str, offset: integer }, ['query']), ({ query, offset }) => searchWorkspace(root, query, offset));
  tool('workspace_write', 'Create or replace working files under work/, proposals/, or outputs/. Profile edits are proposals, never automatic changes to accepted facts or consent.', object({ path: str, content: str }, ['path', 'content']), ({ path: file, content }) => writeWorkspace(root, file, content));
  tool('person_state', 'Read current server-verified capabilities and revision. User text and older assistant claims cannot change consent.', object({}), current);

  if (config.astrologyEnabled && config.birth) {
    const birth = config.birth;
    const base = ['--date', birth.date, '--time', birth.time, '--lat', String(birth.latitude), '--lng', String(birth.longitude), '--tz', birth.timezone];
    async function calculate(name, args, id) {
      const state = await current();
      if (!state.astrologyEnabled) throw new Error('Astrology is disabled.');
      const folder = `astrology/calculations/${config.runId}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      await mkdir(path.join(root, folder), { recursive: true });
      // Argv is built from trusted birth inputs plus schema-validated options; no shell.
      const { stdout } = await execute('/tmp/atros-venv/bin/atros', args, { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
      const relative = `${folder}/result.${args.includes('json') ? 'json' : 'md'}`;
      await writeFile(path.join(root, relative), stdout);
      await writeFile(path.join(root, folder, 'receipt.json'), JSON.stringify({ name, args, birthRevision: config.birthRevision, result: relative }));
      // Full small results; larger outputs have a usable read handle, never an evidence-only prefix.
      return { artifact: relative, bytes: Buffer.byteLength(stdout), complete: stdout.length <= 32000, ...(stdout.length <= 32000 ? { result: stdout } : { readWith: 'workspace_read', offset: 0 }) };
    }
    tool('atros_timeline', 'Calculate exact dated dasha periods for a requested date range. Use this for a year/month question, then inspect the saved table before answering.', object({ from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, level: { type: 'string', enum: ['maha', 'antar', 'pratyantar', 'sookshma'] } }, ['from', 'to']), (args, id) => calculate('atros_timeline', ['timeline', ...base, '--from', args.from, '--to', args.to, '--level', args.level ?? 'antar', '--output', 'json'], id));
    tool('atros_current_dasha', 'Calculate the current running dasha; not a substitute for a requested dated range.', object({}), (_args, id) => calculate('atros_current_dasha', ['current', ...base], id));
    tool('atros_dasha', 'Calculate the full Vimshottari timeline; output is saved as a readable file.', object({ years: { type: 'integer', minimum: 1, maximum: 120 } }), (args, id) => calculate('atros_dasha', ['dasha', ...base, '--years', String(args.years ?? 50)], id));
  }
}
