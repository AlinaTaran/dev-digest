/* RECALL / PRECISION / CITATION ACCURACY / TRACES PASSED for the latest finished run,
   with the delta (points) against the previous finished run (AC-47/48). */
"use client";

import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { deltaPoints, pct, type Delta } from "@/lib/eval/format";
import { s } from "./styles";

type Metric = "recall" | "precision" | "citation_accuracy";
const METRICS: { key: Metric; label: "recall" | "precision" | "citationAccuracy" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citationAccuracy" },
];

export interface EvalMetricTilesProps {
  /** Latest finished run (null → empty state). */
  latest: EvalSuiteRun | null;
  /** The finished run before it, for the delta. */
  previous?: EvalSuiteRun | null;
  /** Optional per-metric history (oldest first); drawn only with 2+ points (Sparkline NaNs on one). */
  sparklines?: Partial<Record<Metric, number[]>>;
}

export function EvalMetricTiles({ latest, previous = null, sparklines }: EvalMetricTilesProps) {
  const t = useTranslations("eval");
  if (!latest?.metrics) return <div style={s.empty}>{t("evalsTab.noRuns")}</div>;
  const m = latest.metrics;
  const prev = previous?.metrics ?? null;

  const deltaText = (d: Delta): string =>
    d.direction === "flat" ? t("tiles.deltaNone") : t(d.direction === "up" ? "tiles.deltaUp" : "tiles.deltaDown", { n: Math.abs(d.points) });

  return (
    <div style={s.row}>
      {METRICS.map(({ key, label }) => {
        const d = prev ? deltaPoints(m[key], prev[key]) : null;
        const spark = sparklines?.[key];
        return (
          <div key={key} style={s.tile} role="group" aria-label={t(`tiles.${label}`)}>
            <div style={s.label}>{t(`tiles.${label}`)}</div>
            <div style={s.valueRow}>
              <span className="tnum" style={s.value}>
                {pct(m[key])}
              </span>
              {d && (
                <span style={s.delta(d.direction)}>
                  <span aria-hidden="true">{d.label}</span>
                  <span style={s.srOnly}>
                    {deltaText(d)}
                  </span>
                </span>
              )}
            </div>
            {spark && spark.length >= 2 && (
              <div style={s.spark} aria-hidden="true">
                <Sparkline data={spark} w={120} h={24} />
              </div>
            )}
          </div>
        );
      })}
      <div style={s.tile} role="group" aria-label={t("tiles.tracesPassed")}>
        <div style={s.label}>{t("tiles.tracesPassed")}</div>
        <div style={s.valueRow}>
          <span className="tnum" style={s.value}>
            {t("tiles.tracesValue", { passed: m.traces_passed, total: m.traces_total })}
          </span>
        </div>
      </div>
    </div>
  );
}
