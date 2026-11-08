import type { CSSProperties } from "react";

/** Co-located styles for the skill EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 28, maxWidth: 980 } satisfies CSSProperties,
  metricsHeader: { marginBottom: 10 } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "2px 0 0" } satisfies CSSProperties,
  hostRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  warn: { fontSize: 12.5, color: "var(--warn, var(--text-muted))" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
