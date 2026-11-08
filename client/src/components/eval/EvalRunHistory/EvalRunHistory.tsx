/* Run history table: newest first, pick exactly two to compare, expand a row for details.
   Presentational — the container supplies `renderDetails` (which may fetch the run). */
"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { pct } from "@/lib/eval/format";
import { formatCost } from "@/lib/format";
import { barWidth, formatRunDate } from "../helpers";
import { s } from "./styles";

const MAX_SELECTED = 2;

export interface EvalRunHistoryProps {
  runs: EvalSuiteRun[];
  onCompare: (a: EvalSuiteRun, b: EvalSuiteRun) => void;
  /** Content of an expanded row (e.g. `<EvalRunDetails …/>`). Omit to hide the Details toggle. */
  renderDetails?: (run: EvalSuiteRun) => ReactNode;
}

function MetricCell({ value, color }: { value: number | undefined; color: string }) {
  return (
    <div style={s.metric}>
      <div style={s.bar} aria-hidden="true">
        <div style={s.fill(barWidth(value), color)} />
      </div>
      <span className="tnum">{pct(value)}</span>
    </div>
  );
}

export function EvalRunHistory({ runs, onCompare, renderDetails }: EvalRunHistoryProps) {
  const t = useTranslations("eval");
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const picked = sorted.filter((r) => selected.includes(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => (on ? (cur.length < MAX_SELECTED ? [...cur, id] : cur) : cur.filter((x) => x !== id)));

  return (
    <section aria-label={t("evalsTab.history")}>
      <div style={s.header}>
        <h3 style={s.heading}>{t("evalsTab.history")}</h3>
        {picked.length !== MAX_SELECTED && <span style={s.hint}>{t("evalsTab.compareSelect")}</span>}
        <span style={s.spacer} />
        <Button
          kind="primary"
          icon="Layers"
          disabled={picked.length !== MAX_SELECTED}
          onClick={() => picked[0] && picked[1] && onCompare(picked[0], picked[1])}
        >
          {t("evalsTab.compare")}
        </Button>
      </div>
      {sorted.length === 0 ? (
        <div style={s.empty}>{t("history.empty")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              <th style={s.th}>{t("history.columns.startedAt")}</th>
              <th style={s.th}>{t("history.columns.version")}</th>
              <th style={s.th}>{t("history.columns.recall")}</th>
              <th style={s.th}>{t("history.columns.precision")}</th>
              <th style={s.th}>{t("history.columns.citation")}</th>
              <th style={s.th}>{t("history.columns.cases")}</th>
              <th style={s.th}>{t("history.columns.cost")}</th>
              <th style={s.th}>{t("history.columns.status")}</th>
              {renderDetails && <th style={s.th} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((run) => {
              const checked = selected.includes(run.id);
              const version = t("history.version", { n: run.owner_version });
              const date = formatRunDate(run.started_at);
              const m = run.metrics;
              const expanded = expandedId === run.id;
              return (
                <Fragment key={run.id}>
                  <tr>
                    <td style={s.td}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={!checked && selected.length >= MAX_SELECTED}
                        aria-label={t("history.selectRun", { version, date })}
                        style={s.checkbox(checked, !checked && selected.length >= MAX_SELECTED)}
                        onClick={() => toggle(run.id, !checked)}
                      >
                        {checked && <Icon.Check size={11} aria-hidden="true" style={s.checkMark} />}
                      </button>
                    </td>
                    <td style={s.td} className="mono">
                      {date}
                    </td>
                    <td style={s.td}>
                      <span style={s.version}>{version}</span>
                      {run.owner_kind === "skill" && run.host_agent_name && <span style={s.host}> · {run.host_agent_name}</span>}
                    </td>
                    <td style={s.td}>
                      <MetricCell value={m?.recall} color="var(--accent)" />
                    </td>
                    <td style={s.td}>
                      <MetricCell value={m?.precision} color="var(--ok)" />
                    </td>
                    <td style={s.td}>
                      <MetricCell value={m?.citation_accuracy} color="var(--warn)" />
                    </td>
                    <td style={s.td} className="tnum">
                      {m ? t("tiles.tracesValue", { passed: m.traces_passed, total: m.traces_total }) : `${run.cases_done}/${run.cases_total}`}
                    </td>
                    <td style={s.td} className="tnum">
                      {formatCost(m?.cost_usd)}
                    </td>
                    <td style={s.td}>
                      <span style={s.badge(run.status)}>{t(`history.status.${run.status}`)}</span>
                      {run.cases_errored > 0 && <span style={s.reason}> {t("history.errorBadge", { count: run.cases_errored })}</span>}
                      {run.error_reason === "interrupted" && <div style={s.reason}>{t("history.interrupted")}</div>}
                    </td>
                    {renderDetails && (
                      <td style={s.td}>
                        <Button
                          size="sm"
                          kind="tertiary"
                          aria-expanded={expanded}
                          aria-label={t("history.detailsAria", { version })}
                          onClick={() => setExpandedId(expanded ? null : run.id)}
                        >
                          {t("evalsTab.details")}
                        </Button>
                      </td>
                    )}
                  </tr>
                  {expanded && renderDetails && (
                    <tr>
                      <td colSpan={10} style={s.detailsCell}>
                        {renderDetails(run)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
