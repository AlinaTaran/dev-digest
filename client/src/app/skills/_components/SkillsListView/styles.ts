import type { CSSProperties } from "react";

/** Co-located styles for SkillsListView (the /skills master-detail shell with
    nothing selected yet). */
export const s = {
  shell: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  emptyPane: { flex: 1, display: "grid", placeItems: "center" } satisfies CSSProperties,
  emptyCard: { textAlign: "center", maxWidth: 320 } satisfies CSSProperties,
  emptyTitle: { fontSize: 18, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
  emptyBody: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
