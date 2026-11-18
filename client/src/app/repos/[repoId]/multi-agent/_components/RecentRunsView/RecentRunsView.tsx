/* Recent runs — /repos/:repoId/multi-agent. The 10 latest multi-agent runs of the
   repo, newest first; each row opens that PR's results page. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { useRecentMultiRuns } from "@/lib/hooks/multi-agent";
import { relativeTime } from "../../../pulls/helpers";
import { StatusChip } from "../../[prNumber]/_components/MultiAgentResultsView/StatusChip";
import { formatSeconds, formatTotalCost } from "../../[prNumber]/_components/MultiAgentResultsView/helpers";
import { s } from "./styles";

export function RecentRunsView() {
  const t = useTranslations("multiAgent");
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("configure.breadcrumb") }];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? <RepoNotFound /> : <RecentRuns key={repoId} repoId={repoId} />}
    </AppShell>
  );
}

function RecentRuns({ repoId }: { repoId: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const runs = useRecentMultiRuns(repoId);
  const newHref = `/repos/${repoId}/multi-agent/new`;

  if (runs.isLoading) {
    return (
      <div style={s.skeletonWrap}>
        <Skeleton height={28} width={260} />
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (runs.isError) {
    return <ErrorState fullScreen title={t("recent.loadError")} onRetry={() => runs.refetch()} />;
  }
  const list = runs.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon="Layers"
        title={t("recent.emptyTitle")}
        body={t("recent.emptyBody")}
        cta={t("recent.emptyCta")}
        onCta={() => router.push(newHref)}
      />
    );
  }

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div style={s.headText}>
          <h1 style={s.h1}>{t("recent.title")}</h1>
          <p style={s.subtitle}>{t("recent.subtitle")}</p>
        </div>
        <Button kind="primary" icon="Plus" onClick={() => router.push(newHref)}>
          {t("recent.newRun")}
        </Button>
      </div>
      <div style={s.list}>
        {list.map((run) => (
          <RunRow key={run.id} run={run} repoId={repoId} />
        ))}
      </div>
    </div>
  );
}

function RunRow({ run, repoId }: { run: MultiAgentRunSummary; repoId: string }) {
  const t = useTranslations("multiAgent");
  const [hover, setHover] = React.useState(false);
  const running = run.status === "running";
  const ago = relativeTime(run.ran_at);
  return (
    <Link
      href={`/repos/${repoId}/multi-agent/${run.pr_number}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.row(hover)}
    >
      <div style={s.rowTitle}>
        <span className="mono" style={s.prNumber}>
          #{run.pr_number}
        </span>
        <span style={s.prTitle}>{run.pr_title}</span>
      </div>
      <StatusChip status={run.status} />
      <span style={s.meta}>{t("recent.agents", { count: run.agent_count })}</span>
      <span style={s.meta}>{ago === "now" ? t("recent.justNow") : t("recent.ago", { time: ago })}</span>
      <span style={s.meta}>{running ? "—" : `${formatSeconds(run.duration_ms)}s`}</span>
      <span style={s.meta}>{formatTotalCost(run.cost_usd)}</span>
    </Link>
  );
}
