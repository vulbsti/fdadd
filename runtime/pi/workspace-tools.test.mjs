import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listWorkspace,
  readWorkspace,
  searchWorkspace,
  workspacePath,
  writeWorkspace,
} from './workspace-tools.mjs';

async function withTempRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-tools-test-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('rejects traversal, absolute paths, backslashes, and symlinks', async () => {
  await withTempRoot(async root => {
    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.txt`);
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, path.join(root, 'linked-file.txt'));
    await fs.symlink(path.dirname(root), path.join(root, 'linked-dir'));

    try {
      for (const invalid of ['../escape.txt', 'nested/../../escape.txt', outside, 'nested\\file.txt']) {
        await assert.rejects(workspacePath(root, invalid), /Invalid workspace-relative path/);
      }
      await assert.rejects(workspacePath(root, 'linked-file.txt'), /symlinks are not permitted/);
      await assert.rejects(workspacePath(root, 'linked-dir/outside.txt'), /symlinks are not permitted/);
    } finally {
      await fs.rm(outside, { force: true });
    }
  });
});

test('keeps canonical person files read-only while allowing work, proposals, and outputs', async () => {
  await withTempRoot(async root => {
    const personFile = path.join(root, 'person-context.md');
    await fs.writeFile(personFile, 'canonical context');

    await assert.rejects(writeWorkspace(root, 'person-context.md', 'changed'), /read-only/);
    await assert.rejects(workspacePath(root, 'person-context.md', true), /read-only/);
    assert.equal(await fs.readFile(personFile, 'utf8'), 'canonical context');

    for (const relative of ['work/draft.md', 'proposals/change.md', 'outputs/report/result.json']) {
      const content = `created: ${relative}`;
      const receipt = await writeWorkspace(root, relative, content);
      assert.deepEqual(receipt, { path: relative, bytes: Buffer.byteLength(content) });
      assert.equal(await fs.readFile(path.join(root, relative), 'utf8'), content);
    }
  });
});

test('reads complete lines by page, including content beyond character 300', async () => {
  await withTempRoot(async root => {
    const longLine = `${'x'.repeat(340)}needed-data-beyond-character-300`;
    await fs.writeFile(path.join(root, 'long.txt'), `first\n${longLine}\nthird\nfourth`);

    const firstPage = await readWorkspace(root, 'long.txt', 0, 2);
    assert.deepEqual(firstPage, {
      path: 'long.txt',
      offset: 0,
      totalLines: 4,
      text: `first\n${longLine}`,
      nextOffset: 2,
    });
    assert.ok(firstPage.text.includes('needed-data-beyond-character-300'));

    const secondPage = await readWorkspace(root, 'long.txt', firstPage.nextOffset, 2);
    assert.deepEqual(secondPage, {
      path: 'long.txt',
      offset: 2,
      totalLines: 4,
      text: 'third\nfourth',
      nextOffset: null,
    });
  });
});

test('returns every literal search match across pages', async () => {
  await withTempRoot(async root => {
    await fs.mkdir(path.join(root, 'a'));
    await fs.writeFile(path.join(root, 'a', 'first.txt'), 'needle.*[x]\nNEEDLE.*[X]\nneedleZZZx');
    await fs.writeFile(path.join(root, 'b.txt'), 'prefix needle.*[x] suffix\nnone');

    const pageOne = await searchWorkspace(root, 'needle.*[x]', 0, 2);
    assert.deepEqual(pageOne, {
      matches: [
        { path: 'a/first.txt', line: 1, text: 'needle.*[x]' },
        { path: 'a/first.txt', line: 2, text: 'NEEDLE.*[X]' },
      ],
      total: 3,
      nextOffset: 2,
    });

    const pageTwo = await searchWorkspace(root, 'needle.*[x]', pageOne.nextOffset, 2);
    assert.deepEqual(pageTwo, {
      matches: [{ path: 'b.txt', line: 1, text: 'prefix needle.*[x] suffix' }],
      total: 3,
      nextOffset: null,
    });
  });
});

test('isolates listing, reading, searching, and writing between workspace roots', async () => {
  await withTempRoot(async parent => {
    const firstRoot = path.join(parent, 'first');
    const secondRoot = path.join(parent, 'second');
    await fs.mkdir(firstRoot);
    await fs.mkdir(secondRoot);
    await fs.writeFile(path.join(firstRoot, 'shared.txt'), 'first root marker');
    await fs.writeFile(path.join(secondRoot, 'shared.txt'), 'second root marker');

    assert.deepEqual(await listWorkspace(firstRoot), ['shared.txt']);
    assert.deepEqual(await listWorkspace(secondRoot), ['shared.txt']);
    assert.equal((await readWorkspace(firstRoot, 'shared.txt')).text, 'first root marker');
    assert.equal((await readWorkspace(secondRoot, 'shared.txt')).text, 'second root marker');
    assert.equal((await searchWorkspace(firstRoot, 'second root')).total, 0);
    assert.equal((await searchWorkspace(secondRoot, 'first root')).total, 0);

    await writeWorkspace(firstRoot, 'work/only-first.txt', 'private to first root');
    assert.deepEqual(await listWorkspace(firstRoot), ['shared.txt', 'work/only-first.txt']);
    assert.deepEqual(await listWorkspace(secondRoot), ['shared.txt']);
  });
});
