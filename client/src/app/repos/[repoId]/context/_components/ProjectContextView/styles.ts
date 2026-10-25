import type { CSSProperties } from "react";

/** Co-located styles for the Project Context page. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1280, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  globs: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  globsLink: { color: "var(--accent-text)", textDecoration: "underline", marginLeft: 8 } satisfies CSSProperties,
  toolbar: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  body: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 380px) 1fr",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  notice: { padding: "8px 14px", fontSize: 12.5, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  loadingStack: { display: "grid", gap: 8, padding: 14 } satisfies CSSProperties,
} as const;
