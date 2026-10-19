import type { CSSProperties } from "react";

export const s = {
  wrap: { width: "100%", overflowX: "auto" } satisfies CSSProperties,
  svg: { display: "block", maxWidth: "100%", height: "auto" } satisfies CSSProperties,
  empty: { color: "var(--text-muted)", fontSize: 13, padding: "8px 0" } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  dot: (color: string) =>
    ({ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }) satisfies CSSProperties,
} as const;

export type NodeTone = "symbol" | "caller" | "endpoint" | "cron" | "more";

export const NODE_PAINT: Record<NodeTone, { fill: string; stroke: string; text: string }> = {
  symbol: { fill: "var(--bg-elevated)", stroke: "var(--accent)", text: "var(--text-primary)" },
  caller: { fill: "var(--bg-elevated)", stroke: "var(--border)", text: "var(--text-secondary)" },
  endpoint: { fill: "var(--bg-elevated)", stroke: "var(--accent)", text: "var(--text-primary)" },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)", text: "var(--text-primary)" },
  more: { fill: "transparent", stroke: "var(--border)", text: "var(--text-muted)" },
};

export const EDGE_STROKE = "var(--border-strong)";
export const LEGEND_COLOR: Record<Exclude<NodeTone, "more">, string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};
