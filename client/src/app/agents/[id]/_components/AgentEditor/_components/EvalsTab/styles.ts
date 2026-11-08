import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 28, maxWidth: 980 } satisfies CSSProperties,
  metricsHeader: { marginBottom: 10 } satisfies CSSProperties,
  trendHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 } satisfies CSSProperties,
  link: { fontSize: 12.5, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "2px 0 0" } satisfies CSSProperties,
  scoring: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
