import { EVAL_MAX_DIFF_BYTES, type EvalExpectation, type EvalInputFile } from '@devdigest/shared';
import type { UnifiedDiff } from '@devdigest/shared';
import { normalizePath } from './matching.js';

export interface DiffFieldError {
  path: string;
  message: string;
}

/** CRLF -> LF (EC-23). */
export function normalizeDiffText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

export function diffByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** AC-21: empty / no hunk / over the 256 KB cap. `raw` is the (normalised) text. */
export function validateDiffInput(raw: string, parsed: UnifiedDiff): DiffFieldError[] {
  if (raw.trim() === '') return [{ path: 'input_diff', message: 'Diff must not be empty' }];
  if (diffByteLength(raw) > EVAL_MAX_DIFF_BYTES) {
    return [{ path: 'input_diff', message: `Diff exceeds ${EVAL_MAX_DIFF_BYTES} bytes` }];
  }
  if (!parsed.files.some((f) => f.hunks.length > 0)) {
    return [{ path: 'input_diff', message: 'Diff contains no hunk' }];
  }
  return [];
}

/** AC-22: derived on every save. */
export function inputFilesFrom(parsed: UnifiedDiff): EvalInputFile[] {
  return parsed.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
}

/** EC-24: non-blocking warnings for expectation files absent from the diff. */
export function expectationFileWarnings(
  expectations: EvalExpectation[],
  parsed: UnifiedDiff,
): { index: number; path: string; message: string }[] {
  const files = new Set(parsed.files.map((f) => normalizePath(f.path)));
  return expectations.flatMap((e, index) =>
    files.has(normalizePath(e.file))
      ? []
      : [{ index, path: `[${index}].file`, message: 'file not in diff' }],
  );
}
