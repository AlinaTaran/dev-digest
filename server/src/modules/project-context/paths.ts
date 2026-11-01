import { posix } from 'node:path';
import { PROJECT_CONTEXT_MAX_PATH, type ContextDocType } from '@devdigest/shared';
import { MAX_GLOBS, MAX_GLOB_LENGTH, MAX_GLOB_BRACE_GROUPS, MAX_GLOB_BRACE_ALTERNATIVES } from './constants.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const TYPED_DIRS: readonly ContextDocType[] = ['specs', 'docs', 'insights'];

/** True when a repo-relative posix path matches any of the globs. */
export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => posix.matchesGlob(path, g));
}

/**
 * Why a client-supplied doc path is not acceptable, or `null` when it is.
 * Never trust the request: absolute, backslash, `..`, NUL/control chars,
 * over-long, non-`.md`, or outside the configured globs are all rejected.
 */
export function validateContextPath(path: string, globs: readonly string[]): string | null {
  if (path.length === 0) return 'path is empty';
  if (path.length > PROJECT_CONTEXT_MAX_PATH) return 'path is too long';
  if (CONTROL_CHARS.test(path)) return 'path contains control characters';
  if (path.includes('\\')) return 'path contains a backslash';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'path must be relative';
  const segments = path.split('/');
  if (segments.some((s) => s === '..')) return "path contains a '..' segment";
  if (segments.some((s) => s === '.' || s === '')) return 'path has an empty or "." segment';
  if (!path.endsWith('.md')) return 'path must end in .md';
  if (!matchesAnyGlob(path, globs)) return 'path does not match the project context globs';
  return null;
}

/** AC-4: type = the first DIRECTORY segment equal to specs/docs/insights, else `other`. */
export function docType(path: string): ContextDocType {
  const dirs = path.split('/').slice(0, -1);
  const hit = dirs.find((s) => (TYPED_DIRS as readonly string[]).includes(s));
  return (hit as ContextDocType | undefined) ?? 'other';
}

/**
 * `matchesGlob` expands braces per match (multiplicatively), so a crafted glob
 * like `{1..1000}{1..1000}/*.md` blocks the event loop. Reject numeric/char
 * ranges and nested groups, and cap the number of brace groups and total alternatives.
 */
function validateBraces(g: string): string | null {
  // Nested groups multiply expansions in ways the flat counts below miss
  // (`{<70 alts>,{q}}{<11 alts>}`), so they are rejected outright.
  let depth = 0;
  for (const ch of g) {
    if (ch === '{') depth += 1;
    else if (ch === '}' && depth > 0) depth -= 1;
    if (depth > 1) return 'nested brace groups are not allowed in globs';
  }
  const groups = g.match(/\{[^{}]*\}/g) ?? [];
  const opens = (g.match(/\{/g) ?? []).length;
  if (opens > MAX_GLOB_BRACE_GROUPS) return `a glob may use at most ${MAX_GLOB_BRACE_GROUPS} brace groups`;
  if (groups.some((b) => b.includes('..'))) return 'brace ranges ({a..b}) are not allowed in globs';
  const alternatives = groups.reduce((n, b) => n + b.split(',').length, 0);
  if (alternatives > MAX_GLOB_BRACE_ALTERNATIVES) {
    return `a glob may have at most ${MAX_GLOB_BRACE_ALTERNATIVES} brace alternatives`;
  }
  return null;
}

/** AC-13: why a search-glob list is invalid, or `null` when it is fine. */
export function validateGlobs(globs: readonly string[]): string | null {
  if (globs.length < 1) return 'at least one glob is required';
  if (globs.length > MAX_GLOBS) return `at most ${MAX_GLOBS} globs are allowed`;
  for (const g of globs) {
    if (g.length === 0 || g.trim().length === 0) return 'globs must not be empty';
    if (g.length > MAX_GLOB_LENGTH) return `a glob is longer than ${MAX_GLOB_LENGTH} characters`;
    if (CONTROL_CHARS.test(g)) return 'a glob contains control characters';
    if (g.startsWith('/') || /^[a-zA-Z]:/.test(g)) return 'globs must be relative to the repo';
    if (g.split(/[\\/]/).some((s) => s === '..')) return "globs must not contain a '..' segment";
    const braceErr = validateBraces(g);
    if (braceErr) return braceErr;
  }
  return null;
}

/** `a/b.md` -> `{ name: 'b.md', dir: 'a' }` (`dir` is '' for a root file). */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf('/');
  return i === -1 ? { name: path, dir: '' } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}
