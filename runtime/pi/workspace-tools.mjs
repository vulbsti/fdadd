import { promises as fs } from 'node:fs';
import path from 'node:path';

// These tools expose actual files, not an excerpt-only imitation of a filesystem.
export async function workspacePath(root, relative, writing = false) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative)
    || relative.split(/[\\/]/).includes('..') || relative.includes('\\')) throw new Error('Invalid workspace-relative path.');
  if (writing && !/^(work|proposals|outputs)\//.test(relative)) throw new Error('Canonical context is read-only. Write a proposal or work/output artifact.');
  const resolvedRoot = await fs.realpath(root);
  const target = path.resolve(resolvedRoot, relative);
  let current = resolvedRoot;
  for (const component of relative.split('/').filter(Boolean)) {
    current = path.join(current, component);
    try {
      const entry = await fs.lstat(current);
      if (entry.isSymbolicLink()) throw new Error('Workspace symlinks are not permitted.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!writing) throw error;
    }
  }
  if (!target.startsWith(`${resolvedRoot}/`)) throw new Error('Path leaves workspace.');
  return target;
}

export async function listWorkspace(root) {
  const result = [];
  async function walk(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) result.push(relative);
    }
  }
  await walk(root);
  return result.sort();
}

export async function readWorkspace(root, relative, offset = 0, limit = 200) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Read pages require offset >= 0 and 1–1000 lines.');
  const content = await fs.readFile(await workspacePath(root, relative), 'utf8');
  const lines = content.split('\n');
  return { path: relative, offset, totalLines: lines.length, text: lines.slice(offset, offset + limit).join('\n'), nextOffset: offset + limit < lines.length ? offset + limit : null };
}

export async function searchWorkspace(root, query, offset = 0, limit = 50) {
  if (!query || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Search needs a literal query and a valid page.');
  const matches = [];
  for (const relative of await listWorkspace(root)) {
    const text = await fs.readFile(await workspacePath(root, relative), 'utf8');
    for (const [index, line] of text.split('\n').entries()) {
      if (line.toLowerCase().includes(query.toLowerCase())) matches.push({ path: relative, line: index + 1, text: line });
    }
  }
  return { matches: matches.slice(offset, offset + limit), total: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null };
}

export async function writeWorkspace(root, relative, content) {
  const target = await workspacePath(root, relative, true);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return { path: relative, bytes: Buffer.byteLength(content) };
}
