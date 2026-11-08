import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 4px" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: 12 } satisfies CSSProperties,
  runError: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11.5,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    padding: "6px 10px",
    fontWeight: 600,
  } satisfies CSSProperties,
  td: { padding: "8px 10px", verticalAlign: "top", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  name: { fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  result: (kind: "pass" | "fail" | "error"): CSSProperties => ({
    fontWeight: 600,
    color: kind === "pass" ? "var(--ok)" : kind === "fail" ? "var(--crit)" : "var(--warn)",
  }),
  subHeading: { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  list: { margin: "2px 0 0", paddingLeft: 18, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
};
