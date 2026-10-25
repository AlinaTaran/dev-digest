import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { mkdtemp, mkdir, writeFile, symlink, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoDocsError } from '@devdigest/shared';
import { FsRepoDocsStore } from './repo-docs.js';

const failRename = vi.hoisted(() => ({ on: false }));
vi.mock('node:fs/promises', async (orig) => {
  const actual = await orig<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: (...a: Parameters<typeof actual.rename>) =>
      failRename.on ? Promise.reject(new Error('EROFS')) : actual.rename(...a),
  };
});

const REPO = { owner: 'acme', name: 'app' };

describe('FsRepoDocsStore', () => {
  let tmp: string;
  let root: string;
  let store: FsRepoDocsStore;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'repo-docs-'));
    root = join(tmp, 'acme', 'app');
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'a.md'), '# A\n');
    store = new FsRepoDocsStore(tmp);
  });

  afterEach(async () => {
    failRename.on = false;
    await rm(tmp, { recursive: true, force: true });
  });

  it('reports root status', async () => {
    expect(await store.rootStatus(REPO)).toBe('ok');
    expect(await store.rootStatus({ owner: 'x', name: 'y' })).toBe('missing');
  });

  it('reads a regular file and reports missing', async () => {
    const r = await store.read(REPO, 'docs/a.md', 1024);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(new TextDecoder().decode(r.bytes)).toBe('# A\n');
    expect((await store.read(REPO, 'docs/nope.md', 1024)).kind).toBe('missing');
  });

  it('rejects symlinks (even ones pointing outside the clone)', async () => {
    await writeFile(join(tmp, 'secrets.json'), '{"k":1}');
    await symlink(join(tmp, 'secrets.json'), join(root, 'docs', 'evil.md'));
    expect((await store.read(REPO, 'docs/evil.md', 1024)).kind).toBe('rejected_path');
    await expect(store.writeExisting(REPO, 'docs/evil.md', new Uint8Array([1]))).rejects.toMatchObject({
      kind: 'rejected_path',
    });
    expect(await readFile(join(tmp, 'secrets.json'), 'utf8')).toBe('{"k":1}');
  });

  it('rejects a file reached through a symlinked directory', async () => {
    await mkdir(join(tmp, 'outside'));
    await writeFile(join(tmp, 'outside', 'x.md'), 'x');
    await symlink(join(tmp, 'outside'), join(root, 'linked'));
    expect((await store.read(REPO, 'linked/x.md', 1024)).kind).toBe('rejected_path');
  });

  it('rejects ../ escapes and absolute paths', async () => {
    await writeFile(join(tmp, 'acme', 'outside.md'), 'x');
    expect((await store.read(REPO, '../outside.md', 1024)).kind).toBe('rejected_path');
    expect((await store.read(REPO, 'docs/../../outside.md', 1024)).kind).toBe('rejected_path');
    expect((await store.read(REPO, join(tmp, 'acme', 'outside.md'), 1024)).kind).toBe('rejected_path');
    await expect(store.writeExisting(REPO, '../outside.md', new Uint8Array([1]))).rejects.toBeInstanceOf(
      RepoDocsError,
    );
  });

  it('returns too_large before reading', async () => {
    await writeFile(join(root, 'docs', 'big.md'), 'x'.repeat(100));
    expect(await store.read(REPO, 'docs/big.md', 50)).toEqual({ kind: 'too_large', sizeBytes: 100 });
  });

  it('writeExisting overwrites atomically and leaves no temp file', async () => {
    await store.writeExisting(REPO, 'docs/a.md', new TextEncoder().encode('# B\n'));
    expect(await readFile(join(root, 'docs', 'a.md'), 'utf8')).toBe('# B\n');
    expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
  });

  it('writeExisting refuses to create a missing file', async () => {
    await expect(store.writeExisting(REPO, 'docs/new.md', new Uint8Array([1]))).rejects.toMatchObject({
      kind: 'missing',
    });
    expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
  });

  it('keeps the original intact and cleans the temp file when the write fails', async () => {
    failRename.on = true;
    await expect(store.writeExisting(REPO, 'docs/a.md', new TextEncoder().encode('NEW'))).rejects.toMatchObject({
      kind: 'io',
    });
    failRename.on = false;
    expect(await readFile(join(root, 'docs', 'a.md'), 'utf8')).toBe('# A\n');
    expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
  });

  it('lists matching files, skipping excluded dirs, .git and symlinks', async () => {
    await mkdir(join(root, 'node_modules', 'pkg', 'docs'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'pkg', 'docs', 'n.md'), 'n');
    await mkdir(join(root, '.git', 'docs'), { recursive: true });
    await writeFile(join(root, '.git', 'docs', 'g.md'), 'g');
    await writeFile(join(root, 'docs', 'b.txt'), 'b');
    await symlink(join(root, 'docs', 'a.md'), join(root, 'docs', 'link.md'));
    const found = await store.list(REPO, {
      match: (rel) => rel.endsWith('.md'),
      excludeDirs: ['node_modules', '.git'],
    });
    expect(found.map((f) => f.path)).toEqual(['docs/a.md']);
    expect(found[0]!.sizeBytes).toBe(4);
  });
});
