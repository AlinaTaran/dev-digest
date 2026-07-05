import type { ConventionCandidate } from "@devdigest/shared";

/** ":11" for a single line, ":11-15" for a range, "" when there's no evidence
    line at all (evidence_line_start absent). */
export function evidenceLineSuffix(
  c: Pick<ConventionCandidate, "evidence_line_start" | "evidence_line_end">
): string {
  if (c.evidence_line_start == null) return "";
  const { evidence_line_start: start, evidence_line_end: end } = c;
  if (end != null && end !== start) return `:${start}-${end}`;
  return `:${start}`;
}

/** Confidence → CSS colour token. Same thresholds as the shared ConfidenceNum
    primitive (vendor/ui/primitives/ConfidenceNum.tsx) so a candidate's bar and
    a finding's confidence dot read consistently across the app. */
export function confidenceColor(confidence: number): string {
  const pct = Math.round(confidence * 100);
  if (pct >= 85) return "var(--ok)";
  if (pct >= 65) return "var(--warn)";
  return "var(--text-muted)";
}
