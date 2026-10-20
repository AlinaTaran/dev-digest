import type { PrHistoryItem } from "@/lib/types";

/** `2026-09-30T10:12:00Z` -> `2026-09-30`. */
export function mergedDate(mergedAt: string): string {
  return mergedAt.slice(0, 10);
}

/** Keep the first occurrence per `pr_number` (the server doesn't promise uniqueness). */
export function dedupeByPrNumber(items: PrHistoryItem[]): PrHistoryItem[] {
  const seen = new Set<number>();
  return items.filter((i) => (seen.has(i.pr_number) ? false : (seen.add(i.pr_number), true)));
}
