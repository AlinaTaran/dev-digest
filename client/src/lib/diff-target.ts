/**
 * Deep-link target for the Files changed tab: `?tab=diff&file=<path>&line=<n>`.
 * Pure helpers; encoding is left to URLSearchParams.
 */

export interface DiffTarget {
  file: string;
  line: number | null;
  inDiff: boolean;
}

const LINE_RE = /^[1-9]\d{0,6}$/;

export function parseDiffTarget(
  search: URLSearchParams,
  paths: readonly string[],
): DiffTarget | null {
  const file = search.get('file');
  if (!file) return null;
  const rawLine = search.get('line');
  const line = rawLine !== null && LINE_RE.test(rawLine) ? Number(rawLine) : null;
  return { file, line, inDiff: paths.includes(file) };
}

export function diffTargetParams(
  file: string,
  line?: number | null,
): Record<'tab' | 'file' | 'line', string | null> {
  return { tab: 'diff', file, line: line ? String(line) : null };
}
