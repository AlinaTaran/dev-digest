import type { CSSProperties } from "react";

export const s = {
  quote: {
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    fontSize: 14,
    margin: "0 0 16px",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20,
  } satisfies CSSProperties,
  scopeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  scopeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bulletList: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  emptyLine: {
    fontSize: 13.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  riskSection: {
    marginTop: 20,
  } satisfies CSSProperties,
  riskRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  } satisfies CSSProperties,
  riskChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 500,
    border: "1px solid transparent",
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;

/** Severity → chip color tokens, mirroring the SEV map's crit/warn tokens. */
export const RISK_SEV: Record<
  "high" | "medium" | "low",
  { color: string; bg: string; border: string }
> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)", border: "var(--crit)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", border: "var(--warn)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)", border: "var(--border)" },
};
