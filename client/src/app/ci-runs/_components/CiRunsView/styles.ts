import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  notice: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    marginBottom: 14,
  } satisfies CSSProperties,
  noticeError: { borderColor: "var(--crit)" } satisfies CSSProperties,
  errorList: { margin: "6px 0 0", paddingLeft: 18 } satisfies CSSProperties,
  tableWrap: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflowX: "auto",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "10px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  link: { color: "var(--accent)" } satisfies CSSProperties,
} as const;
