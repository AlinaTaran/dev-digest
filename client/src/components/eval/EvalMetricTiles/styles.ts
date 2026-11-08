import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  tile: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  } satisfies CSSProperties,
  label: { fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-muted)" } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700 } satisfies CSSProperties,
  spark: { marginTop: 8 } satisfies CSSProperties,
  delta: (dir: "up" | "down" | "flat"): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 600,
    color: dir === "up" ? "var(--ok)" : dir === "down" ? "var(--crit)" : "var(--text-muted)",
  }),
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
};
