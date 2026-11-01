import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", gap: 10 },
  caption: { margin: 0, fontSize: 12, color: "var(--text-muted)" },
  list: { margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6, color: "var(--text-muted)", fontSize: 13 },
  row: { paddingLeft: 4 },
  item: { display: "flex", alignItems: "center", gap: 8 },
  main: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  command: {
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    padding: "4px 8px",
    borderRadius: 4,
    overflowWrap: "anywhere",
    alignSelf: "flex-start",
  },
  meta: { fontSize: 12, color: "var(--text-muted)" },
  copied: { fontSize: 12, color: "var(--ok)" },
};
