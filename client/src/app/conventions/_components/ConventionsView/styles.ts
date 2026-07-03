import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 7,
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  } satisfies CSSProperties,
  acceptedCount: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
