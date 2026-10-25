import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  row: { display: "flex", gap: 10, alignItems: "center", marginBottom: 10 } satisfies CSSProperties,
  input: { flex: 1 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12, marginTop: 14 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 10 } satisfies CSSProperties,
  saved: { fontSize: 13, color: "var(--ok)", fontWeight: 600 } satisfies CSSProperties,
} as const;
