/** NFR-1 input budget constants for the PR Brief prompt. */
export const USER_BUDGET_CHARS = 32_000;
export const SYSTEM_MAX_CHARS = 6_000;
export const TITLE_CHARS = 300;
export const INTENT_CHARS = 2_000;
export const DIFF_FILES_MAX = 200;
export const HUNK_RANGES_PER_FILE = 10;
export const SYMBOLS_MAX = 10;
export const CALLERS_MAX = 40;
export const CALLERS_MIN = 10;
export const ENDPOINTS_MAX = 20;
export const CRONS_MAX = 10;
export const DESCRIPTION_CHARS = 6_000;
export const DESCRIPTION_MIN = 2_000;
export const SPEC_DOCS_MAX = 5;
export const SPEC_DOC_CHARS = 6_000;
export const SPECS_TOTAL_CHARS = 12_000;
export const PATH_MAX_CHARS = 512;

/**
 * Cut `text` to at most `cap` UTF-16 units (ellipsis included), never leaving a
 * lone high surrogate from a split pair.
 */
export function cutText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  let end = Math.max(cap - 1, 0);
  const last = text.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}
