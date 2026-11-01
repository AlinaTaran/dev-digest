import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1280, margin: "0 auto" } satisfies CSSProperties,
  // `minmax(0, 1fr)`: the implicit `auto` track would grow to the diagram's min-content and overflow the page.
  content: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, minWidth: 0 } satisfies CSSProperties,
  loadingStack: { display: "grid", gap: 8, padding: 14 } satisfies CSSProperties,
} as const;
