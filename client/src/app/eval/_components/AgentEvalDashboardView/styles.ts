import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalDashboardView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  back: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, margin: "10px 0 16px" } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  chip: {
    fontSize: 11.5,
    fontFamily: "var(--font-mono, monospace)",
    padding: "1px 7px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  select: {
    fontSize: 13,
    padding: "6px 8px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  alert: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--danger)",
    color: "var(--danger)",
    fontSize: 13.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  section: { margin: "22px 0 10px", fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  detailsError: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 13.5 } satisfies CSSProperties,
} as const;
