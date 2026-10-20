"use client";

import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@/lib/types";
import { layoutBlastGraph, NODE_H, type GraphNode } from "./layout";
import { EDGE_STROKE, LEGEND_COLOR, NODE_PAINT, s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

function nodeTitle(t: Translate, n: GraphNode): string {
  switch (n.kind) {
    case "symbol":
      return t("graph.nodeSymbol", { name: n.name });
    case "caller":
      return t("graph.nodeCaller", { name: n.name, location: n.title });
    case "endpoint":
      return t("graph.nodeEndpoint", { name: n.name });
    case "cron":
      return t("graph.nodeCron", { name: n.name });
    case "more":
      return t("graph.more", { count: n.count ?? 0 });
  }
}

const LEGEND = ["symbol", "caller", "endpoint", "cron"] as const;

export function BlastGraph({ data }: { data: BlastRadiusResponse }) {
  const t = useTranslations("blast");
  const layout = layoutBlastGraph(data);
  const hasContent = layout.nodes.some((n) => n.kind === "caller" || n.kind === "endpoint" || n.kind === "cron");

  if (!hasContent) return <div style={s.empty}>{t("graph.empty")}</div>;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const showCron = layout.nodes.some((n) => n.kind === "cron");

  return (
    <div>
      <div style={s.wrap}>
        <svg
          role="img"
          aria-label={t("graph.ariaSummary", data.stats)}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          style={s.svg}
        >
          {layout.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={e.id}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={EDGE_STROKE}
                strokeWidth={1.25}
                strokeDasharray={e.dashed ? "4 4" : undefined}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const paint = NODE_PAINT[n.kind];
            return (
              <g key={n.id}>
                <title>{nodeTitle(t, n)}</title>
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={NODE_H}
                  rx={8}
                  fill={paint.fill}
                  stroke={paint.stroke}
                  strokeWidth={1}
                  strokeDasharray={n.kind === "more" ? "3 3" : undefined}
                />
                <text
                  x={n.x + n.w / 2}
                  y={n.y + NODE_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  fill={paint.text}
                >
                  {n.kind === "more" ? t("graph.more", { count: n.count ?? 0 }) : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={s.legend}>
        {LEGEND.filter((k) => k !== "cron" || showCron).map((k) => (
          <span key={k} style={s.legendItem}>
            <span style={s.dot(LEGEND_COLOR[k])} aria-hidden />
            {t(`graph.legend.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
