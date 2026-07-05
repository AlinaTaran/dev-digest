import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  pickWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    padding: "8px 0",
  } satisfies CSSProperties,
  pickHint: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  previewBanner: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 16,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  ignoredList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  ignoredItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  ignoredIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
