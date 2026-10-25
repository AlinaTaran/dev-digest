import type { CSSProperties } from "react";

export const s = {
  quote: {
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    fontSize: 14,
    margin: "0 0 16px",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20,
  } satisfies CSSProperties,
  scopeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  scopeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bulletList: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  emptyLine: {
    fontSize: 13.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
} as const;
