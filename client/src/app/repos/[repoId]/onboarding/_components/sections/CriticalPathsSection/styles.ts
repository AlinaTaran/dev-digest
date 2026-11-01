import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
  },
  icon: { color: "var(--text-muted)", display: "inline-flex", flexShrink: 0 },
  main: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flex: 1 },
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    flexShrink: 1,
  },
  why: { fontSize: 13, color: "var(--text-secondary)", flexShrink: 0, maxWidth: "50%" },
  fanIn: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 },
  open: { fontSize: 13, color: "var(--accent-text)", textDecoration: "none", flexShrink: 0 },
};
