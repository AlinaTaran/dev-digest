/** Constants for the project-context module. */

/** Directories never scanned for context docs (NFR-1). */
export const EXCLUDED_DIRS: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
];

/** `project_context_globs` constraints (AC-13). */
export const MAX_GLOBS = 10;
export const MAX_GLOB_LENGTH = 200;
/** Brace expansion is multiplicative inside `matchesGlob` (glob DoS) — keep it tiny. */
export const MAX_GLOB_BRACE_GROUPS = 3;
export const MAX_GLOB_BRACE_ALTERNATIVES = 12;

/** Docs are read in small batches so a 500-doc listing stays bounded. */
export const READ_BATCH = 25;

/** Spec error codes (Zod validates shape only; these are thrown as AppError). */
export const ERR = {
  invalidPath: 'invalid_context_path',
  notFound: 'doc_not_found',
  changedOnDisk: 'doc_changed_on_disk',
  tooLarge: 'doc_too_large',
  unreadable: 'doc_unreadable',
  tooMany: 'too_many_context_docs',
  saveFailed: 'doc_save_failed',
} as const;

/** Run-time reasons a resolved doc could not be injected. */
export type MissingReason = 'missing' | 'unreadable' | 'rejected path' | 'too large' | 'not cloned';
