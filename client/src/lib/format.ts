/** Adaptive-precision USD cost. null/undefined → "—"; known zero → "$0.00".
 *  Sub-cent amounts show 3 significant figures ($0.000717, not $0.0007). */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) {
    // $0.01–$0.99: 3 decimal places, strip trailing zeros
    return `$${usd.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  // Sub-cent: 3 significant figures.
  // magnitude = position of the leading significant digit (e.g. -4 for 0.000717).
  // dp = -magnitude + 2 gives exactly 3 sig figs without stripping
  // (trailing zeros here are significant and must be kept).
  const magnitude = Math.floor(Math.log10(usd));
  const dp = -magnitude + 2;
  return `$${usd.toFixed(dp)}`;
}
