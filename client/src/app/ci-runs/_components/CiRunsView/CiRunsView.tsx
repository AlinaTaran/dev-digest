/* /ci-runs — CI Runs. Global page: the latest 50 agent reviews that ran inside CI. Refresh pulls
   new result artifacts from GitHub; per-repo failures come back in `errors[]` and are listed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRefreshResult, CiRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { formatCost } from "@/lib/format";
import { KNOWN_STATUSES, KNOWN_VERDICTS, formatDuration, jobUrl, prUrl, statusColor } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["repo", "pullRequest", "agent", "verdict", "findings", "cost", "duration", "status", "job"] as const;

function RunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci");
  const pr = prUrl(run.repo, run.pr_number);
  const job = jobUrl(run.github_url);
  const status = run.status;
  return (
    <tr>
      <td className="mono" style={s.td}>
        {run.repo ?? "—"}
      </td>
      <td style={s.td}>
        {run.pr_number == null ? (
          "—"
        ) : pr ? (
          <a href={pr} target="_blank" rel="noreferrer" style={s.link}>
            #{run.pr_number}
          </a>
        ) : (
          `#${run.pr_number}`
        )}
      </td>
      <td style={s.td}>{run.agent ?? "—"}</td>
      <td style={s.td}>
        {run.verdict ? (KNOWN_VERDICTS.includes(run.verdict) ? t(`runs.verdict.${run.verdict}`) : run.verdict) : "—"}
      </td>
      <td style={s.td}>{run.findings_count ?? "—"}</td>
      <td style={s.td}>{formatCost(run.cost_usd)}</td>
      <td style={s.td}>{formatDuration(run.duration_s)}</td>
      <td style={s.td}>
        <Badge color={statusColor(status)}>
          {status && KNOWN_STATUSES.includes(status) ? t(`runs.status.${status}`) : (status ?? "—")}
        </Badge>
      </td>
      <td style={s.td}>
        {job ? (
          <a href={job} target="_blank" rel="noreferrer" style={s.link}>
            {t("runs.viewJob")}
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function RefreshNotice({ result }: { result: CiRefreshResult }) {
  const t = useTranslations("ci");
  return (
    <>
      <div role="status" style={s.notice}>
        {t("runs.refreshed", { count: result.ingested })}
      </div>
      {result.errors.length > 0 && (
        <div role="alert" style={{ ...s.notice, ...s.noticeError }}>
          {t("runs.refreshErrorsTitle")}
          <ul style={s.errorList}>
            {result.errors.map((e) => (
              <li key={e.repo}>{t("runs.refreshError", { repo: e.repo, reason: e.reason })}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function CiRunsView() {
  const t = useTranslations("ci");
  const runs = useCiRuns();
  const refresh = useRefreshCiRuns();
  const inFlight = React.useRef(false);

  // A double click in the same tick would fire two POSTs before `isPending` re-renders.
  const onRefresh = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    refresh.mutate(undefined, { onSettled: () => (inFlight.current = false) });
  };

  const items = runs.data?.items ?? [];

  let body: React.ReactNode;
  if (runs.isLoading) {
    body = <Skeleton height={200} />;
  } else if (runs.isError) {
    body = <ErrorState title={t("runs.loadFailed")} onRetry={() => runs.refetch()} />;
  } else if (items.length === 0) {
    body = <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />;
  } else {
    body = (
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} style={s.th}>
                  {t(`runs.table.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: "Global" }, { label: t("runs.title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <div style={s.subtitle}>{t("runs.subtitle")}</div>
          </div>
          <Button kind="secondary" icon="RefreshCw" onClick={onRefresh} loading={refresh.isPending} disabled={refresh.isPending}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
        {refresh.data && <RefreshNotice result={refresh.data} />}
        {body}
      </div>
    </AppShell>
  );
}
