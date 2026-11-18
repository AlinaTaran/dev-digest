/* Multi-agent results — latest multi-run of a PR: header totals, Tabs/Columns
   toggle, "Where agents disagree", and the per-run trace drawer. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "../../../../pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer";
import { ColumnsMode } from "./ColumnsMode";
import { TabsMode } from "./TabsMode";
import { DisagreementBlock } from "./DisagreementBlock";
import { formatSeconds, formatTotalCost } from "./helpers";
import { useMultiAgentResults, type ResultsMode } from "./useMultiAgentResults";
import { s } from "./styles";

export function MultiAgentResultsView() {
  const t = useTranslations("multiAgentResults");
  const router = useRouter();
  const v = useMultiAgentResults();
  const crumb = [
    { label: v.repoName, mono: true, href: `/repos/${v.repoId}/pulls` },
    { label: `#${v.prNumber}`, mono: true },
  ];

  if (v.pullsLoading || v.runLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.skeletonWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (!v.pr) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.emptyWrap}>
          <EmptyState
            icon="Search"
            title={t("empty.notFoundTitle")}
            body={t("empty.notFoundBody", { number: v.prNumber })}
          />
        </div>
      </AppShell>
    );
  }

  if (!v.run || v.noRun) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.emptyWrap}>
          <EmptyState
            icon="Layers"
            title={t("empty.noRunTitle")}
            body={t("empty.noRunBody")}
            cta={t("empty.configure")}
            onCta={() => router.push(`/repos/${v.repoId}/multi-agent/new?pr=${v.prNumber}`)}
          />
        </div>
      </AppShell>
    );
  }

  const run = v.run;
  const modeTabs: { key: ResultsMode; label: string }[] = [
    { key: "columns", label: t("mode.columns") },
    { key: "tabs", label: t("mode.tabs") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerTop}>
            <Link href={`/repos/${v.repoId}/multi-agent`} style={s.backLink}>
              <Icon.ChevronLeft size={13} aria-hidden />
              {t("backToRecent")}
            </Link>
            <Button
              kind="secondary"
              size="sm"
              icon="Wrench"
              onClick={() => router.push(`/repos/${v.repoId}/multi-agent/new?pr=${v.prNumber}`)}
            >
              {t("configure")}
            </Button>
            <h1 style={s.title}>{t("title")}</h1>
            <span style={s.subtitle}>{t("subtitle", { count: run.agent_count })}</span>
            <span style={s.spacer} />
            <div style={s.segmented} role="group">
              {modeTabs.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={v.mode === m.key}
                  onClick={() => v.setMode(m.key)}
                  style={{ ...s.segment, ...(v.mode === m.key ? s.segmentOn : null) }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div style={s.headerBottom}>
            <div style={s.prLine}>
              <span style={s.prNumber}>#{v.pr.number}</span>
              <span style={s.prTitle}>{v.pr.title}</span>
            </div>
            <div style={s.summary}>
              <Icon.Boxes size={14} style={{ color: "var(--accent)" }} aria-hidden />
              {t("summary", {
                count: run.agent_count,
                seconds: formatSeconds(run.total_duration_ms),
                cost: formatTotalCost(run.total_cost_usd),
              })}
            </div>
          </div>
        </div>

        {v.mode === "columns" ? (
          <ColumnsMode columns={run.columns} onViewTrace={v.openTrace} />
        ) : (
          <TabsMode
            columns={run.columns}
            groups={run.groups}
            active={v.activeColumn}
            onSelect={v.setSelectedRunId}
            onViewTrace={v.openTrace}
            onAction={(id, action) => v.action.mutate({ findingIds: [id], action })}
            pending={v.action.isPending}
            repoFullName={v.repoFullName}
            headSha={v.pr.head_sha}
          />
        )}

        <DisagreementBlock
          groups={run.groups}
          columns={run.columns}
          showOnlyConflicts={v.showOnlyConflicts}
          onToggleConflicts={v.setShowOnlyConflicts}
          onGroupAction={(findingIds, action) => v.action.mutate({ findingIds, action })}
          pending={v.action.isPending}
        />
      </div>

      {v.traceColumn && (
        <RunTraceDrawer
          key={v.traceColumn.run_id}
          runId={v.traceColumn.run_id}
          prNumber={v.pr.number}
          agentName={v.traceColumn.agent_name}
          findings={v.traceColumn.findings}
          running={v.traceColumn.status === "running"}
          onClose={v.closeTrace}
        />
      )}
    </AppShell>
  );
}
