import type { CSSProperties } from "react";

/** Co-located styles for RecentRunsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  headText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  row: (hover: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    color: "inherit",
    textDecoration: "none",
    background: hover ? "var(--bg-hover, var(--bg-surface))" : "transparent",
    transition: "background .1s",
  }),
  rowTitle: { flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  prNumber: { fontSize: 13, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  prTitle: {
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  skeletonWrap: { padding: "24px 32px", maxWidth: 1000, margin: "0 auto", display: "grid", gap: 10 } satisfies CSSProperties,
};
