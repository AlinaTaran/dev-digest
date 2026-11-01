import { posix } from 'node:path';
import { ONBOARDING_LIMITS } from './limits.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Normalise a model/user supplied repo path: trim, strip a leading `./`,
 * posix-normalise, collapse a trailing `/`. `null` when it is unusable:
 * empty, absolute, backslashed, contains a `..` segment, NUL/control chars, or
 * longer than 512 characters. Matching stays exact and case-sensitive (EC-9).
 */
export function normalizeRepoPath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > ONBOARDING_LIMITS.pathChars) return null;
  if (CONTROL_CHARS.test(trimmed) || trimmed.includes('\\')) return null;
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) return null;
  if (trimmed.split('/').some((s) => s === '..')) return null;
  const stripped = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  const normalized = posix.normalize(stripped).replace(/\/+$/, '');
  if (normalized === '' || normalized === '.' || normalized.startsWith('..')) return null;
  if (normalized.length > ONBOARDING_LIMITS.pathChars) return null;
  return normalized;
}

/** Glob shapes accepted as a reference: `dir/*`, `dir/**`, `dir/*.ext`. No braces (glob DoS). */
const GLOB_REF = /^[^*?[\]{}]+\/(\*\*|\*|\*\.[A-Za-z0-9]+)$/;

export type PathKind = 'file' | 'dir';

/** Exact-match lookup over a list of repo-relative file paths. */
export class PathIndex {
  private readonly files: Set<string>;
  private readonly dirs = new Set<string>();

  constructor(paths: readonly string[]) {
    this.files = new Set(paths);
    for (const p of paths) {
      let i = p.lastIndexOf('/');
      while (i > 0) {
        const dir = p.slice(0, i);
        if (this.dirs.has(dir)) break;
        this.dirs.add(dir);
        i = dir.lastIndexOf('/');
      }
    }
  }

  get size(): number {
    return this.files.size;
  }

  hasFile(p: string): boolean {
    return this.files.has(p);
  }

  /** True when some file lives under `dir/`. */
  hasDir(dir: string): boolean {
    return this.dirs.has(dir.replace(/\/+$/, ''));
  }

  classify(p: string): PathKind | null {
    if (this.hasFile(p)) return 'file';
    if (this.hasDir(p)) return 'dir';
    return null;
  }

  /** A file, a dir (trailing `/` optional) or a `dir/*`-style glob that matches a file. */
  matchesRef(ref: string): boolean {
    if (ref.includes('{')) return false;
    const norm = normalizeRepoPath(ref);
    if (norm && this.classify(norm)) return true;
    const trimmed = ref.trim().replace(/^\.\//, '');
    if (!GLOB_REF.test(trimmed) || trimmed.includes('..')) return false;
    const prefix = trimmed.slice(0, trimmed.lastIndexOf('/'));
    // `dir/*` and `dir/**` reference "something under dir" (a file may sit in a subdir).
    if (trimmed.endsWith('/*') || trimmed.endsWith('/**')) return this.hasDir(prefix);
    for (const f of this.files) {
      if (posix.matchesGlob(f, trimmed)) return true;
    }
    return false;
  }
}
