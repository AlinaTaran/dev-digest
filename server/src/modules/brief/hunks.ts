import type { SmartDiffRole } from '@devdigest/shared';
import { isSafeFactPath } from './paths.js';

export interface LineRange {
  start: number;
  len: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side ranges read from hunk headers only; never returns line text. */
export function newSideRanges(patch: string | null): LineRange[] {
  if (!patch) return [];
  const out: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    out.push({ start: Number(m[1]), len: m[2] === undefined ? 1 : Number(m[2]) });
  }
  return out;
}

/** Sort and merge overlapping/adjacent ranges; zero-length ranges are dropped. */
export function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = ranges.filter((r) => r.len > 0).sort((a, b) => a.start - b.start);
  const out: LineRange[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev && r.start <= prev.start + prev.len) {
      const end = Math.max(prev.start + prev.len, r.start + r.len);
      prev.len = end - prev.start;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

const endOf = (r: LineRange): number => r.start + r.len - 1;

export function inRanges(line: number, ranges: LineRange[]): boolean {
  return ranges.some((r) => r.len > 0 && line >= r.start && line <= endOf(r));
}

/** Nearest covered line; on a tie the lower one. Null when nothing is covered. */
export function nearestInRanges(line: number, ranges: LineRange[]): number | null {
  let best: number | null = null;
  for (const r of ranges) {
    if (r.len <= 0) continue;
    const cand = Math.min(Math.max(line, r.start), endOf(r));
    if (
      best === null ||
      Math.abs(cand - line) < Math.abs(best - line) ||
      (Math.abs(cand - line) === Math.abs(best - line) && cand < best)
    ) {
      best = cand;
    }
  }
  return best;
}

export function rangesOverlap(start: number, end: number, ranges: LineRange[]): boolean {
  return ranges.some((r) => r.len > 0 && start <= endOf(r) && end >= r.start);
}

export interface DiffFileFact {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  ranges: LineRange[];
  hasLines: boolean;
}

export interface DiffFactRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Per-file facts for the prompt and grounding. Dedupes by path (EC-23). */
export function buildDiffFacts(
  rows: DiffFactRow[],
  roleOf: (path: string) => SmartDiffRole,
): { files: DiffFileFact[]; dropped: number } {
  const byPath = new Map<string, DiffFileFact>();
  let dropped = 0;
  for (const row of rows) {
    if (!isSafeFactPath(row.path)) {
      dropped++;
      continue;
    }
    const ranges = newSideRanges(row.patch);
    const prev = byPath.get(row.path);
    if (prev) {
      prev.additions += row.additions;
      prev.deletions += row.deletions;
      prev.ranges = mergeRanges([...prev.ranges, ...ranges]);
      prev.hasLines = prev.ranges.length > 0;
    } else {
      const merged = mergeRanges(ranges);
      byPath.set(row.path, {
        path: row.path,
        role: roleOf(row.path),
        additions: row.additions,
        deletions: row.deletions,
        ranges: merged,
        hasLines: merged.length > 0,
      });
    }
  }
  return { files: [...byPath.values()], dropped };
}
