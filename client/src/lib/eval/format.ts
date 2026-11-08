/* eval/format.ts — pure formatting for eval metrics (percentages, deltas, cost). */
import { formatCost } from "../format";

export type DeltaDirection = "up" | "down" | "flat";

export interface Delta {
  points: number;
  direction: DeltaDirection;
  /** Visible label, e.g. "▲ 4pt". */
  label: string;
  /** Screen-reader text, e.g. "up 4 points". */
  a11y: string;
}

/** Fraction (0..1) → whole-percent string. null/undefined → "—". */
export function pct(fraction: number | null | undefined): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${Math.round(fraction * 100)}%`;
}

/** Difference in whole percentage points between two fractions. */
export function deltaPoints(next: number, prev: number): Delta {
  const points = Math.round((next - prev) * 100);
  const abs = Math.abs(points);
  if (points === 0) return { points: 0, direction: "flat", label: "0pt", a11y: "no change" };
  const unit = abs === 1 ? "point" : "points";
  return points > 0
    ? { points, direction: "up", label: `▲ ${abs}pt`, a11y: `up ${abs} ${unit}` }
    : { points, direction: "down", label: `▼ ${abs}pt`, a11y: `down ${abs} ${unit}` };
}

/** Cost change between runs, e.g. "+$0.012" / "−$0.004". null if either side unknown. */
export function costDelta(next: number | null | undefined, prev: number | null | undefined): string | null {
  if (next == null || prev == null) return null;
  const diff = next - prev;
  if (diff === 0) return formatCost(0);
  return `${diff > 0 ? "+" : "−"}${formatCost(Math.abs(diff))}`;
}

/** Cost with exactly 2 decimals ("$0.23"); sub-half-cent amounts fall back to `formatCost` so they do not read "$0.00". */
export function cost2(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd > 0 && usd < 0.005) return formatCost(usd);
  return `$${usd.toFixed(2)}`;
}

/** Cost change in the same 2-decimal style ("$0.02"; the arrow shows the sign). null if either side unknown. */
export function costDelta2(
  next: number | null | undefined,
  prev: number | null | undefined,
): { text: string; direction: DeltaDirection } | null {
  if (next == null || prev == null) return null;
  const diff = next - prev;
  const text = cost2(Math.abs(diff));
  if (diff === 0 || text === "$0.00") return { text: "$0.00", direction: "flat" };
  return { text, direction: diff > 0 ? "up" : "down" };
}
