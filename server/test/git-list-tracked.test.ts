import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { MockGitClient } from '../src/adapters/mocks.js';

describe('GitClient.listTrackedFiles', () => {
  let root: string;
  let sha: string;
  const repo = { owner: 'acme', name: 'tree' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dd-ls-tree-'));
    const dir = join(root, repo.owner, repo.name);
    await mkdir(join(dir, 'src', 'deep'), { recursive: true });
    await writeFile(join(dir, 'README.md'), '# hi');
    await writeFile(join(dir, 'src', 'deep', 'a.ts'), 'export {}');
    await writeFile(join(dir, 'документація.md'), 'привіт');
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    sha = git('rev-parse', 'HEAD').trim();
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists exact, unquoted paths (non-ASCII + nested) and rejects a bad sha', async () => {
    const client = new SimpleGitClient(root);
    const files = await client.listTrackedFiles(repo, sha);
    expect(files.sort()).toEqual(['README.md', 'src/deep/a.ts', 'документація.md'].sort());
    await expect(client.listTrackedFiles(repo, '--help')).rejects.toThrow();
    await expect(client.listTrackedFiles(repo, 'deadbeefdeadbeef')).rejects.toThrow();
  });

  it('MockGitClient defaults to the keys of `files`, overridable via `trackedFiles`', async () => {
    expect(await new MockGitClient({ files: { 'a.ts': '' } }).listTrackedFiles()).toEqual(['a.ts']);
    expect(
      await new MockGitClient({ files: { 'a.ts': '' }, trackedFiles: ['b.ts'] }).listTrackedFiles(),
    ).toEqual(['b.ts']);
  });
});
