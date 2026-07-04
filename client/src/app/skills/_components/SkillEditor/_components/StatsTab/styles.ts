import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  panels: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    alignItems: "start",
  } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  panelHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 14,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agentList: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
  } satisfies CSSProperties,
  agentName: { flex: 1, fontSize: 13.5, color: "var(--text-primary)", minWidth: 0 } satisfies CSSProperties,
  agentOpen: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
