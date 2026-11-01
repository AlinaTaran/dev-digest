import type React from "react";

export const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", gap: 16 },
  summary: { fontSize: 14, color: "var(--text-secondary)" },
  subhead: { margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" },
  dirs: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  dirRow: { display: "flex", alignItems: "baseline", gap: 12 },
  dirPath: { fontSize: 13, color: "var(--text-primary)" },
  dirCount: { fontSize: 12, color: "var(--text-muted)" },
};
