/* /eval — Eval Dashboard (AC-59..AC-62). Agent cards + recent runs across all agents.
   Global page (no repoId). Data via useEvalOverview; degrades to an error state when the endpoint fails. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalOverview, useRunAllEvals } from "@/lib/hooks/eval";
import { pct } from "@/lib/eval/format";
import { barWidth, formatRunDate } from "@/components/eval/helpers";
import { COLOR_CITATION, COLOR_PRECISION, COLOR_RECALL } from "./constants";
import { agentHref, agentsWithCases, newestRuns, skipReasons, sparklinePoints } from "./helpers";
import { s } from "./styles";

type AgentOverview = EvalOverview["agents"][number];
type RecentRun = EvalOverview["recent_runs"][number];

function AgentCard({ agent }: { agent: AgentOverview }) {
  const t = useTranslations("eval");
  const run = agent.last_run;
  const m = run?.metrics ?? null;
  const spark = sparklinePoints(agent.recall_sparkline);
  return (
    <Link href={agentHref(agent.agent_id)} style={s.card} aria-label={t("overview.openAgent", { name: agent.name })}>
      <div style={s.iconBox} aria-hidden="true">
        <Icon.Cpu size={17} />
      </div>
      <div style={s.cardMain}>
        <div style={s.nameRow}>
          <span style={s.name}>{agent.name}</span>
          <span style={s.chip}>{agent.model}</span>
        </div>
        <div style={s.meta}>
          {run
            ? t("overview.lastRun", {
                n: run.owner_version,
                date: formatRunDate(run.started_at),
                passed: m?.traces_passed ?? 0,
                total: m?.traces_total ?? run.cases_total,
              })
            : t("overview.neverRun")}
        </div>
      </div>
      {spark && <Sparkline data={spark} color={COLOR_RECALL} w={100} h={32} />}
      <div style={s.metrics}>
        {(
          [
            ["overview.recall", m?.recall, COLOR_RECALL],
            ["overview.prec", m?.precision, COLOR_PRECISION],
            ["overview.cite", m?.citation_accuracy, COLOR_CITATION],
          ] as const
        ).map(([key, value, color]) => (
          <div key={key} style={s.metric}>
            <div style={s.metricLabel}>{t(key)}</div>
            <div className="tnum" style={s.metricValue(color)}>
              {pct(value)}
            </div>
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}

function BarCell({ value, color }: { value: number | undefined; color: string }) {
  return (
    <div style={s.barCell}>
      <div style={s.bar} aria-hidden="true">
        <div style={s.fill(barWidth(value), color)} />
      </div>
      <span className="tnum">{pct(value)}</span>
    </div>
  );
}

function RecentRunsTable({ runs }: { runs: RecentRun[] }) {
  const t = useTranslations("eval");
  const th = (key: string) => (
    <th scope="col" style={s.th}>
      {t(`overview.columns.${key}`)}
    </th>
  );
  return (
    <table style={s.table}>
      <thead style={s.srOnly}>
        <tr>
          {th("agent")}
          {th("ranAt")}
          {th("version")}
          {th("recall")}
          {th("precision")}
          {th("citation")}
          {th("pass")}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td style={{ ...s.td, ...s.agentCell }}>{r.agent_name}</td>
            <td style={s.td} className="tnum">
              {formatRunDate(r.started_at)}
            </td>
            <td style={{ ...s.td, ...s.version, ...s.mono }}>{t("history.version", { n: r.owner_version })}</td>
            <td style={s.td}>
              <BarCell value={r.metrics?.recall} color={COLOR_RECALL} />
            </td>
            <td style={s.td}>
              <BarCell value={r.metrics?.precision} color={COLOR_PRECISION} />
            </td>
            <td style={s.td}>
              <BarCell value={r.metrics?.citation_accuracy} color={COLOR_CITATION} />
            </td>
            <td style={s.td} className="tnum">
              <span style={s.pass}>
                {r.metrics ? t("tiles.tracesValue", { passed: r.metrics.traces_passed, total: r.metrics.traces_total }) : "—"}
              </span>
              {r.status !== "done" && <span style={s.statusMark(r.status)}>{t(`history.status.${r.status}`)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalOverview();
  const runAll = useRunAllEvals();

  const agents = agentsWithCases(data?.agents ?? []);
  const runs = newestRuns(data?.recent_runs ?? []);
  const result = runAll.data;

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("overview.title")}</h1>
            <p style={s.subtitle}>{t("overview.subtitle")}</p>
          </div>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={runAll.isPending || agents.length === 0}
            onClick={() => runAll.mutate()}
          >
            {runAll.isPending ? t("overview.runningAll") : t("overview.runAll")}
          </Button>
        </div>

        {result && (
          <div role="status" style={s.notice}>
            {t("overview.summary", { started: result.started.length, skipped: result.skipped.length })}
            {result.skipped.length > 0 &&
              ` (${skipReasons(result)
                .map((r) => t(`overview.skipReason.${r}`))
                .join(", ")})`}
          </div>
        )}
        {runAll.isError && (
          <div role="alert" style={s.notice}>
            {t("evalsTab.runFailedTitle")}
          </div>
        )}

        {isLoading && (
          <div style={s.cards}>
            <Skeleton height={76} />
            <Skeleton height={76} />
            <Skeleton height={76} />
          </div>
        )}
        {isError && <ErrorState body={t("overview.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && agents.length === 0 && (
          <EmptyState icon="Gauge" title={t("overview.empty")} body={t("overview.emptyBody")} />
        )}
        {agents.length > 0 && (
          <>
            <h2 style={s.section}>{t("overview.agentsHeading")}</h2>
            <div style={s.cards}>
              {agents.map((a) => (
                <AgentCard key={a.agent_id} agent={a} />
              ))}
            </div>
            <h2 style={s.section}>{t("overview.recentRuns")}</h2>
            {runs.length > 0 ? <RecentRunsTable runs={runs} /> : <div style={s.empty}>{t("overview.emptyRuns")}</div>}
          </>
        )}
      </div>
    </AppShell>
  );
}
