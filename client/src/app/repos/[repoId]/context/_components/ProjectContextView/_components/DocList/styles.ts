import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: (on: boolean): CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 14px",
    border: "none",
    borderBottom: "1px solid var(--border)",
    borderLeft: `3px solid ${on ? "var(--accent)" : "transparent"}`,
    background: on ? "var(--bg-hover)" : "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
  }),
  top: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  footer: { padding: "10px 14px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
