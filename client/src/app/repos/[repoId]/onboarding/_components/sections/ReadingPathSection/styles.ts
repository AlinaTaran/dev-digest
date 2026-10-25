import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  list: { margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8, color: "var(--text-muted)", fontSize: 13 },
  row: { paddingLeft: 4 },
  item: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  why: { fontSize: 13, color: "var(--text-secondary)" },
};
