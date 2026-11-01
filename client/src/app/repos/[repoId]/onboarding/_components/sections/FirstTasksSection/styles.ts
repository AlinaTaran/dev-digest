import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  grid: { listStyle: "none", margin: 0, padding: 0 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" },
  footer: { display: "flex", alignItems: "center", gap: 8 },
  newFile: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" },
};
