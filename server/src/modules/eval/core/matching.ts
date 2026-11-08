import type { EvalExpectation } from '@devdigest/shared';

/** Minimal finding shape the matcher needs (structural; a full `Finding` satisfies it). */
export interface MatchableFinding {
  file: string;
  start_line: number;
  end_line?: number | null;
}

export interface NormalizedRange {
  start: number;
  end: number;
}

/** Strip ONE leading `./`. Nothing else: case- and Unicode-exact (AC-27). */
export function normalizePath(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}

/** `[min, max]` of the two ends; a missing end equals the start (AC-27). */
export function normalizeRange(start: number, end?: number | null): NormalizedRange {
  const e = end ?? start;
  return { start: Math.min(start, e), end: Math.max(start, e) };
}

export function rangesOverlap(a: NormalizedRange, b: NormalizedRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** AC-27: exact path (after `./` strip) AND at least one shared line. */
export function findingMatches(
  finding: MatchableFinding,
  expectation: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  if (normalizePath(finding.file) !== normalizePath(expectation.file)) return false;
  return rangesOverlap(
    normalizeRange(finding.start_line, finding.end_line),
    normalizeRange(expectation.start_line, expectation.end_line),
  );
}
