import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Pure(ish) signal-gathering helpers for the Intent classifier. Everything
 * here is cheap-signals only — no diff bodies are ever read or forwarded.
 */

/** `Math.ceil(chars / 4)` — the same rough token estimator used elsewhere for savings logging. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export interface HunkHeadersResult {
  files: { path: string; additions: number; deletions: number }[];
  /** `path:` sub-heading followed by that file's `@@ -a,b +c,d @@` header lines, one file per block. */
  headers: string;
}

/**
 * Reconstructs the canonical `@@ -oldStart,oldLines +newStart,newLines @@`
 * header text from each file's already-parsed `DiffHunk`s. NOTE: `UnifiedDiff`
 * does not retain a raw per-file patch string (hunks are pre-parsed into
 * structured start/length fields) — there is nothing to substring out of a
 * `.patch` field. This produces the same header information (and the same
 * zero-code-body guarantee) from the structured fields instead.
 */
export function hunkHeaders(diff: UnifiedDiff): HunkHeadersResult {
  const files = diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));

  const blocks: string[] = [];
  for (const f of diff.files) {
    if (f.hunks.length === 0) continue;
    const lines = f.hunks.map(
      (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    );
    blocks.push(`${f.path}:\n${lines.join('\n')}`);
  }

  return { files, headers: blocks.join('\n\n') };
}
