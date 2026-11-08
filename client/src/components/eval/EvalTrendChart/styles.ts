import type { CSSProperties } from "react";

export const SERIES_COLORS = { recall: "var(--accent)", precision: "var(--ok)", citation: "var(--warn)" } as const;

export const s = {
  wrap: { width: "100%" } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: 99,
    background: color,
    marginRight: 6,
  }),
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "24px 0", textAlign: "center" } satisfies CSSProperties,
  tooltip: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12.5,
    boxShadow: "var(--shadow-modal)",
    minWidth: 150,
  } satisfies CSSProperties,
  tipHeader: { fontWeight: 600, marginBottom: 4 } satisfies CSSProperties,
  tipRow: { display: "flex", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } satisfies CSSProperties,
};
