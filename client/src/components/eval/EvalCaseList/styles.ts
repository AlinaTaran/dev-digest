import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  heading: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  counter: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  row: (highlight: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 9,
    border: "1px solid " + (highlight ? "var(--accent)" : "var(--border)"),
    background: highlight ? "var(--accent-bg)" : "var(--bg-elevated)",
    outline: "none",
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", overflowWrap: "anywhere" } satisfies CSSProperties,
  kindChip: (mustFind: boolean): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "1px 7px",
    borderRadius: 4,
    whiteSpace: "nowrap",
    border: "1px solid " + (mustFind ? "var(--accent)" : "var(--border-strong)"),
    background: mustFind ? "var(--accent-bg)" : "var(--bg-hover)",
    color: mustFind ? "var(--accent)" : "var(--text-secondary)",
  }),
  sevChip: {
    fontSize: 11.5,
    padding: "2px 9px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  subtitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginTop: 3 } satisfies CSSProperties,
  state: (state: "passed" | "failed" | "error" | "never"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    color:
      state === "passed" ? "var(--ok)" : state === "failed" ? "var(--crit)" : state === "error" ? "var(--warn)" : "var(--text-muted)",
  }),
  /** passed / failed are conveyed by the row icon visually; the word stays for screen readers. */
  stateText: (state: "passed" | "failed" | "error" | "never"): CSSProperties =>
    state === "passed" || state === "failed"
      ? { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }
      : { color: state === "error" ? "var(--warn)" : "var(--text-muted)" },
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  confirm: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
};
