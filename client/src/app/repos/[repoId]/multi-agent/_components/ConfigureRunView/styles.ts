import type { CSSProperties } from "react";

/** Co-located styles for ConfigureRunView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4, marginBottom: 20 } satisfies CSSProperties,
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 } satisfies CSSProperties,
  select: {
    width: "100%",
    maxWidth: 520,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 14,
  } satisfies CSSProperties,
  agentsHead: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 10px" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    display: "flex",
    gap: 10,
    padding: 12,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    cursor: "pointer",
  } satisfies CSSProperties,
  cardBody: { flex: 1, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  cardName: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  cardDesc: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  cardEstimate: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 14, marginTop: 22 } satisfies CSSProperties,
  total: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 10 } satisfies CSSProperties,
} as const;
