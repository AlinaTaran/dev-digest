/* /eval/[agentId] — one agent's eval dashboard (AC-54, 56, 64, 65, EC-28): tiles with sparkline +
   delta, trend chart, recent runs with Compare + Promote. Period lives in ?days=. */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { CompareRunsModal } from "@/components/eval/CompareRunsModal/CompareRunsModal";
import { EvalMetricTiles } from "@/components/eval/EvalMetricTiles/EvalMetricTiles";
import { EvalRunHistory } from "@/components/eval/EvalRunHistory/EvalRunHistory";
import { EvalTrendChart } from "@/components/eval/EvalTrendChart/EvalTrendChart";
import { PromoteButton } from "@/components/eval/PromoteButton/PromoteButton";
import { RunEvalButton, type RunEvalNotice } from "@/components/eval/RunEvalButton/RunEvalButton";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { evalRunUnavailableReason, useAgentEvalDashboard, useEvalRun, useStartAgentEvalRun } from "@/lib/hooks/eval";
import { EvalRunDetailsLoader } from "./EvalRunDetailsLoader";
import { PERIODS, WIDEST_PERIOD, type Period } from "./constants";
import { finishedRuns, noticeForReason, parsePeriod, sparklines } from "./helpers";
import { s } from "./styles";

export function AgentEvalDashboardView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const days = parsePeriod(search.get("days"));

  const agent = useAgent(agentId);
  const agents = useAgents();
  const dashboard = useAgentEvalDashboard(agentId, days);
  const start = useStartAgentEvalRun();

  const [attachedRunId, setAttachedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<RunEvalNotice>(null);
  const [pair, setPair] = useState<[EvalSuiteRun, EvalSuiteRun] | null>(null);

  const data = dashboard.data;
  const runList = data?.recent_runs ?? [];
  const activeRunId = attachedRunId ?? runList.find((r) => r.status === "running")?.id ?? null;
  const active = useEvalRun(activeRunId);
  const activeRun = active.data?.eval_run;
  const casesTotal = data?.cases_total ?? 0;
  const progress =
    activeRunId && (!activeRun || activeRun.status === "running")
      ? { done: activeRun?.cases_done ?? 0, total: activeRun?.cases_total ?? casesTotal }
      : start.isPending
        ? { done: 0, total: casesTotal }
        : null;

  const setPeriod = (d: Period) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("days", String(d));
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const onStart = () => {
    setNotice(null);
    start.mutate(agentId, {
      onSuccess: (outcome) => {
        if (outcome.kind === "in_progress") setNotice("in_progress");
        setAttachedRunId(outcome.kind === "started" ? outcome.run.id : outcome.activeRunId);
      },
      onError: (e) => setNotice(noticeForReason(evalRunUnavailableReason(e))),
    });
  };

  const agentName = agent.data?.name ?? "";
  const finished = finishedRuns(runList);
  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agentName || agentId },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          {t("agentDashboard.backToAll")}
        </Link>

        <div style={s.header}>
          <div style={s.headerText}>
            <div style={s.nameRow}>
              <h1 style={s.h1}>{agentName}</h1>
              {agent.data && <span style={s.chip}>{agent.data.model}</span>}
            </div>
            {data && (
              <p style={s.subtitle}>
                {t("agentDashboard.runsOnSet", { runs: runList.length, cases: data.cases_total })}
              </p>
            )}
          </div>
          <div style={s.controls}>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button
                  size="sm"
                  icon="Cpu"
                  iconRight="ChevronDown"
                  aria-haspopup="menu"
                  aria-label={`${t("agentDashboard.agentSelect")}: ${agentName}`}
                >
                  {agentName}
                </Button>
              }
              items={(agents.data ?? []).map((a) => ({
                label: a.name,
                icon: "Cpu" as const,
                onClick: () => router.push(`/eval/${a.id}?days=${days}`),
              }))}
            />
            <Dropdown
              width={160}
              align="right"
              trigger={
                <Button
                  size="sm"
                  kind="ghost"
                  icon="Calendar"
                  aria-haspopup="menu"
                  aria-label={`${t("agentDashboard.period.label")}: ${t(`agentDashboard.period.s${days}`)}`}
                >
                  {t(`agentDashboard.period.s${days}`)}
                </Button>
              }
              items={PERIODS.map((d) => ({
                label: t(`agentDashboard.period.d${d}`),
                icon: "Calendar" as const,
                onClick: () => setPeriod(d),
              }))}
            />
            <RunEvalButton
              label={t("agentDashboard.runEval")}
              onStart={onStart}
              progress={progress}
              notice={notice}
              disabled={start.isPending || casesTotal === 0}
            />
          </div>
        </div>

        {activeRun?.status === "failed" && (
          <div role="alert" style={s.alert}>
            {t("evalsTab.runFailedTitle")}
            {activeRun.error_reason ? ` — ${activeRun.error_reason}` : ""}
          </div>
        )}

        {dashboard.isLoading && <Skeleton height={120} />}
        {dashboard.isError && <ErrorState body={t("agentDashboard.loadError")} onRetry={() => dashboard.refetch()} />}

        {data && (
          <>
            {data.alert && (
              <div role="alert" style={s.alert}>
                {t("trend.alert", { message: data.alert })}
              </div>
            )}

            {runList.length === 0 ? (
              <div style={s.empty}>
                {t("agentDashboard.noRunsInPeriod", { days })}
                {days < WIDEST_PERIOD && (
                  <button type="button" style={s.link} onClick={() => setPeriod(WIDEST_PERIOD)}>
                    {t("agentDashboard.show90")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <EvalMetricTiles
                  latest={finished[0] ?? null}
                  previous={finished[1] ?? null}
                  sparklines={sparklines(data.trend)}
                />
                <h2 style={s.section}>{t("trend.title")}</h2>
                <EvalTrendChart points={data.trend} />
                <EvalRunHistory
                  runs={runList}
                  onCompare={(a, b) => setPair([a, b])}
                  renderDetails={(run) => <EvalRunDetailsLoader runId={run.id} />}
                />
              </>
            )}
          </>
        )}

        {pair && (
          <CompareRunsModal
            a={pair[0]}
            b={pair[1]}
            onClose={() => setPair(null)}
            footerExtra={agent.data ? <PromoteButton agent={agent.data} a={pair[0]} b={pair[1]} /> : null}
          />
        )}
      </div>
    </AppShell>
  );
}
