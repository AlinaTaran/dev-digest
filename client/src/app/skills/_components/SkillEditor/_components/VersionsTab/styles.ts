import type { CSSProperties } from "react";
import type { DiffOp } from "./helpers";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 800 } satisfies CSSProperties,
  headingRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 26 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  diffHeading: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  diffCaptionRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  diffCaption: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  diffClose: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12.5,
    color: "var(--accent-text)",
    padding: 0,
  } satisfies CSSProperties,
  diffBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "10px 0",
    overflow: "auto",
    maxHeight: 480,
  } satisfies CSSProperties,
  diffLine: (type: DiffOp["type"]): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "1px 14px",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    background: type === "add" ? "var(--ok-bg)" : type === "del" ? "var(--crit-bg)" : "transparent",
    color: type === "add" ? "var(--ok)" : type === "del" ? "var(--crit)" : "var(--text-secondary)",
  }),
  diffMarker: { flexShrink: 0, width: 10, opacity: 0.8 } satisfies CSSProperties,
} as const;
