import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" } satisfies CSSProperties,
  path: { fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  toggle: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  content: { padding: 16 } satisfies CSSProperties,
  warn: { fontSize: 12.5, color: "var(--warn, var(--text-secondary))", marginBottom: 10 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", flex: 1 } satisfies CSSProperties,
  stack: { display: "grid", gap: 8, padding: 16 } satisfies CSSProperties,
} as const;
