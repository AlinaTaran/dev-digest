import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingArchitectureSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import {
  KIND_COLOR,
  LABEL_FONT,
  LABEL_LINE_H,
  NODE_H,
  NODE_W,
  edgePath,
  labelBox,
  layoutLabels,
  layoutNodes,
  wrapLabel,
} from "./helpers";
import { s } from "./styles";
import { useFitScale } from "./useFitScale";

type Diagram = NonNullable<OnboardingArchitectureSection["diagram"]>;

/** SVG arrows behind absolutely-positioned HTML nodes; edge labels in a second SVG layer on
    top, so a node can never cover them. All labels are text, never HTML. */
export function ArchitectureDiagram({
  diagram,
  repoFullName,
  sourceSha,
}: {
  diagram: Diagram;
  repoFullName: string;
  sourceSha: string;
}) {
  const t = useTranslations("onboarding");
  const layout = layoutNodes(diagram.nodes);
  const byId = new Map(layout.placed.map((p) => [p.node.id, p]));
  const laneUse = new Map<number, number>();
  const edges = diagram.edges.flatMap((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    return from && to ? [{ edge: e, from, to, path: edgePath(from, to, layout, laneUse) }] : [];
  });
  const labels = layoutLabels(
    edges.flatMap(({ edge, path }, i) =>
      edge.label ? [{ lines: wrapLabel(edge.label), full: edge.label, x: path.lx, y: path.ly, i }] : [],
    ),
  );
  const height = Math.max(layout.height, ...labels.map((l) => l.y + labelBox(l.lines).h / 2 + 2));
  // Shrink (down to MIN_SCALE) to fit the card instead of hiding the right-most columns behind a scroll.
  const { ref: scrollRef, scale } = useFitScale<HTMLDivElement>(layout.width);

  return (
    <figure style={s.figure} aria-label={t("architecture.diagramLabel")}>
      <div ref={scrollRef} style={s.scroll}>
        <div style={{ width: layout.width * scale, height: height * scale }}>
          <div
            style={{
              ...s.canvas,
              width: layout.width,
              height,
              transform: `scale(${scale})`,
            }}
          >
            <svg width={layout.width} height={height} style={s.svg} aria-hidden="true">
              <defs>
                <marker
                  id="onb-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
                </marker>
              </defs>
              {edges.map(({ edge, path }, i) => (
                <path
                  key={`${edge.from}-${edge.to}-${i}`}
                  d={path.d}
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth={1.25}
                  markerEnd="url(#onb-arrow)"
                />
              ))}
            </svg>
            {layout.placed.map(({ node, x, y }) => {
              const name = t("architecture.nodeName", {
                label: node.label,
                kind: t(`architecture.kinds.${node.kind}`),
              });
              const style = {
                ...s.node,
                left: x,
                top: y,
                width: NODE_W,
                height: NODE_H,
                borderLeft: `3px solid ${KIND_COLOR[node.kind]}`,
              };
              return node.path ? (
                <a
                  key={node.id}
                  href={githubBlobUrl(repoFullName, sourceSha, node.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  title={node.path}
                  style={{ ...style, ...s.nodeLink }}
                >
                  <span style={s.nodeLabel}>{node.label}</span>
                </a>
              ) : (
                <div key={node.id} role="group" aria-label={name} title={node.label} tabIndex={0} style={style}>
                  <span style={s.nodeLabel}>{node.label}</span>
                </div>
              );
            })}
            <svg width={layout.width} height={height} style={s.labels} aria-hidden="true">
              {labels.map((l) => {
                const box = labelBox(l.lines);
                const top = l.y - box.h / 2;
                return (
                  <g key={l.i} style={s.label}>
                    <title>{l.full}</title>
                    <rect x={l.x - box.w / 2} y={top} width={box.w} height={box.h} rx={3} fill="var(--bg-surface)" />
                    <text textAnchor="middle" fontSize={LABEL_FONT} fill="var(--text-secondary)">
                      {l.lines.map((line, n) => (
                        <tspan key={n} x={l.x} y={top + 2 + (n + 0.5) * LABEL_LINE_H} dominantBaseline="central">
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <figcaption style={s.legend}>
        <span style={s.legendTitle}>{t("architecture.legend")}</span>
        {layout.kinds.map((k) => (
          <span key={k} style={s.legendItem}>
            <span aria-hidden="true" style={{ ...s.swatch, background: KIND_COLOR[k] }} />
            {t(`architecture.kinds.${k}`)}
          </span>
        ))}
      </figcaption>

      {edges.length > 0 && (
        <div className="sr-only">
          <h5>{t("architecture.edges")}</h5>
          <ul>
            {edges.map(({ edge, from, to }, i) => (
              <li key={`${edge.from}-${edge.to}-${i}`}>
                {t("architecture.edge", {
                  from: from.node.label,
                  to: to.node.label,
                })}
                {edge.label ? ` (${edge.label})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
