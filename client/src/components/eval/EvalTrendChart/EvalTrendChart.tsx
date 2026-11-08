/* METRIC TREND: recall / precision / citation per finished run (AC-56..58). One point per run,
   tooltip on hover and keyboard focus (Recharts accessibilityLayer), plus a visually hidden table
   of the same points for assistive tech. Presentational. */
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalTrendPoint } from "@devdigest/shared";
import { pct } from "@/lib/eval/format";
import { formatCost } from "@/lib/format";
import { formatRunDate } from "../helpers";
import { SERIES_COLORS, s } from "./styles";

export interface EvalTrendChartProps {
  /** Finished runs, oldest first. */
  points: EvalTrendPoint[];
  height?: number;
  /** Replace the tooltip body (skill runs add skill version + host, T16). */
  renderTooltip?: (point: EvalTrendPoint) => ReactNode;
}

const SERIES = [
  { key: "recall", legend: "recall" },
  { key: "precision", legend: "precision" },
  { key: "citation_accuracy", legend: "citation" },
] as const;
const COLOR_OF = { recall: SERIES_COLORS.recall, precision: SERIES_COLORS.precision, citation_accuracy: SERIES_COLORS.citation };

/** Default tooltip body: `vN · date`, the three values and the run cost (AC-57). */
export function TrendTooltipBody({ point }: { point: EvalTrendPoint }) {
  const t = useTranslations("eval");
  return (
    <div style={s.tooltip}>
      <div style={s.tipHeader}>{t("trend.header", { version: point.agent_version, date: formatRunDate(point.ran_at) })}</div>
      {SERIES.map(({ key, legend }) => (
        <div key={key} style={s.tipRow}>
          <span>{t(`dashboard.legend.${legend}`)}</span>
          <span className="tnum">{pct(point[key])}</span>
        </div>
      ))}
      <div style={s.tipRow}>
        <span>{t("trend.cost")}</span>
        <span className="tnum">{formatCost(point.cost_usd)}</span>
      </div>
    </div>
  );
}

export function EvalTrendChart({ points, height = 220, renderTooltip }: EvalTrendChartProps) {
  const t = useTranslations("eval");
  if (points.length < 2) {
    return <div style={s.empty}>{points.length === 1 ? t("trend.needTwoRuns") : t("evalsTab.noRuns")}</div>;
  }
  return (
    <div style={s.wrap}>
      <div style={s.legend} aria-hidden="true">
        {SERIES.map(({ key, legend }) => (
          <span key={key}>
            <span style={s.swatch(COLOR_OF[key])} />
            {t(`dashboard.legend.${legend}`)}
          </span>
        ))}
      </div>
      <div style={{ width: "100%", height }} role="group" aria-label={t("trend.chartAria")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} accessibilityLayer margin={{ top: 8, right: 14, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="agent_version" tickFormatter={(v: number) => `v${v}`} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => v.toFixed(2)} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              isAnimationActive={false}
              content={({ payload }) => {
                const point = payload?.[0]?.payload as EvalTrendPoint | undefined;
                if (!point) return null;
                return renderTooltip ? <div style={s.tooltip}>{renderTooltip(point)}</div> : <TrendTooltipBody point={point} />;
              }}
            />
            {SERIES.map(({ key, legend }) => (
              <Line key={key} type="monotone" dataKey={key} name={t(`dashboard.legend.${legend}`)} stroke={COLOR_OF[key]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table style={s.srOnly}>
        <caption>{t("trend.tableCaption")}</caption>
        <thead>
          <tr>
            <th>{t("trend.version")}</th>
            <th>{t("trend.date")}</th>
            <th>{t("dashboard.legend.recall")}</th>
            <th>{t("dashboard.legend.precision")}</th>
            <th>{t("dashboard.legend.citation")}</th>
            <th>{t("trend.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.run_id}>
              <td>{`v${p.agent_version}`}</td>
              <td>{formatRunDate(p.ran_at)}</td>
              <td>{pct(p.recall)}</td>
              <td>{pct(p.precision)}</td>
              <td>{pct(p.citation_accuracy)}</td>
              <td>{formatCost(p.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
