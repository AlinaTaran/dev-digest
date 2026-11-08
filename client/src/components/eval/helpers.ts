/* components/eval/helpers.ts — tiny shared presentation helpers. */

/** ISO timestamp → "YYYY-MM-DD HH:mm" (UTC, deterministic across locales/timezones). */
export function formatRunDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** Whole-percent number for bar widths, clamped to 0..100. */
export function barWidth(fraction: number | null | undefined): number {
  if (fraction == null || Number.isNaN(fraction)) return 0;
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}
