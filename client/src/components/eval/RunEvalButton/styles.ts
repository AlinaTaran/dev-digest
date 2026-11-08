import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 6 } satisfies CSSProperties,
  notice: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  warn: { fontSize: 12.5, color: "var(--warn)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline", marginLeft: 6 } satisfies CSSProperties,
};
