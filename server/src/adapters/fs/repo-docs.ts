import { join, dirname, basename, sep, isAbsolute, posix } from 'node:path';
import { lstat, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  RepoDocsError,
  type RepoDocRead,
  type RepoDocsStore,
  type RepoRef,
} from '@devdigest/shared';

/**
 * RepoDocsStore over the local filesystem. The root is `<cloneDir>/<owner>/<name>`
 * (same rule as `SimpleGitClient.clonePathFor`). Clone content is attacker-controlled,
 * so every read/write realpaths BOTH the root and the target and confines the result
 * inside the root; symlinks are never followed (lstat) for reads, writes and listing.
 */
export class FsRepoDocsStore implements RepoDocsStore {
  constructor(private cloneDir: string) {}

  private rootFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  async rootStatus(repo: RepoRef): Promise<'ok' | 'missing'> {
    try {
      const s = await stat(this.rootFor(repo));
      return s.isDirectory() ? 'ok' : 'missing';
    } catch {
      return 'missing';
    }
  }

  async list(
    repo: RepoRef,
    opts: { match: (rel: string) => boolean; excludeDirs: readonly string[] },
  ): Promise<{ path: string; sizeBytes: number; mtime: string | null }[]> {
    const root = this.rootFor(repo);
    const excluded = new Set(opts.excludeDirs);
    const out: { path: string; sizeBytes: number; mtime: string | null }[] = [];

    const walk = async (relDir: string): Promise<void> => {
      const entries = await readdir(join(root, relDir), { withFileTypes: true });
      for (const e of entries) {
        // Dirent reflects lstat: symlinks (file or dir) report isSymbolicLink and are skipped.
        if (e.isSymbolicLink()) continue;
        const rel = relDir ? `${relDir}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (excluded.has(e.name)) continue;
          await walk(rel);
        } else if (e.isFile() && opts.match(rel)) {
          const s = await lstat(join(root, rel));
          out.push({ path: rel, sizeBytes: s.size, mtime: s.mtime.toISOString() });
        }
      }
    };

    await walk('');
    return out;
  }

  /** Resolve `path` to a confined, non-symlink regular file; null when rejected. */
  private async resolveConfined(
    repo: RepoRef,
    path: string,
  ): Promise<{ kind: 'ok'; real: string; size: number } | { kind: 'missing' } | { kind: 'rejected_path' }> {
    if (!path || isAbsolute(path) || path.includes('\0') || path.includes('\\')) {
      return { kind: 'rejected_path' };
    }
    const normalized = posix.normalize(path);
    if (normalized === '..' || normalized.startsWith('../') || isAbsolute(normalized)) {
      return { kind: 'rejected_path' };
    }

    const root = this.rootFor(repo);
    const target = join(root, normalized);

    let st;
    try {
      st = await lstat(target);
    } catch {
      return { kind: 'missing' };
    }
    if (st.isSymbolicLink() || !st.isFile()) return { kind: 'rejected_path' };

    let rootReal: string;
    let targetReal: string;
    try {
      [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)]);
    } catch {
      return { kind: 'missing' };
    }
    if (!targetReal.startsWith(rootReal + sep)) return { kind: 'rejected_path' };
    return { kind: 'ok', real: targetReal, size: st.size };
  }

  async read(repo: RepoRef, path: string, maxBytes: number): Promise<RepoDocRead> {
    const r = await this.resolveConfined(repo, path);
    if (r.kind !== 'ok') return r;
    if (r.size > maxBytes) return { kind: 'too_large', sizeBytes: r.size };
    try {
      const buf = await readFile(r.real);
      // Re-check after read: the file may have grown between lstat and read.
      if (buf.byteLength > maxBytes) return { kind: 'too_large', sizeBytes: buf.byteLength };
      return { kind: 'ok', bytes: new Uint8Array(buf) };
    } catch {
      return { kind: 'missing' };
    }
  }

  async writeExisting(repo: RepoRef, path: string, bytes: Uint8Array): Promise<void> {
    const r = await this.resolveConfined(repo, path);
    if (r.kind === 'missing') throw new RepoDocsError('missing');
    if (r.kind === 'rejected_path') throw new RepoDocsError('rejected_path');

    // Temp file in the same directory, then rename: the target is never left partial.
    const tmp = join(dirname(r.real), `.${basename(r.real)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const mode = (await lstat(r.real)).mode & 0o777;
      await writeFile(tmp, bytes, { flag: 'wx', mode });
      await rename(tmp, r.real);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw new RepoDocsError('io', err instanceof Error ? err.message : 'write failed');
    }
  }
}
