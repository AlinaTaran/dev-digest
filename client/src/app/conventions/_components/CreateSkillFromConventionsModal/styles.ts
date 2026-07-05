import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  mergedBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 7,
    background: "var(--accent-bg, var(--bg-hover))",
    border: "1px solid var(--accent)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  mergedBannerIcon: { color: "var(--accent)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  typeEnabledRow: { display: "flex", gap: 20 } satisfies CSSProperties,
  typeEnabledCol: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  bodyLabelRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  tokenCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
