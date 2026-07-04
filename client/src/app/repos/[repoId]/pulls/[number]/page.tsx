/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab). Orchestration lives in usePrDetailPage. */
"use client";

import React from "react";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { PrDetailHeader } from "./_components/PrDetailHeader/PrDetailHeader";
import { OverviewTab } from "./_components/OverviewTab/OverviewTab";
import { FindingsTab } from "./_components/FindingsTab/FindingsTab";
import { DiffTab } from "./_components/DiffTab/DiffTab";
import RunTraceDrawer from "./_components/RunTraceDrawer/RunTraceDrawer";
import { ApiError } from "@/lib/api";
import { usePrDetailPage } from "./usePrDetailPage";

const skeletonWrap: React.CSSProperties = {
  padding: "28px 32px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 1080,
  margin: "0 auto",
};
const bodyWrap: React.CSSProperties = {
  padding: "24px 32px 44px",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  maxWidth: 1080,
  margin: "0 auto",
};

export default function PRDetailPage() {
  const p = usePrDetailPage();
  const crumb = [
    { label: p.repoName, mono: true, href: `/repos/${p.repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${p.repoId}/pulls` },
    { label: `#${p.number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (p.repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (p.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={skeletonWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (p.isError || !p.pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={p.error instanceof ApiError ? p.error.message : `PR #${p.number} could not be loaded.`}
          onRetry={() => p.refetch()}
        />
      </AppShell>
    );
  }

  const pr = p.pr;
  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={p.prId}
        tab={p.tab}
        findingsCount={p.findingsCount}
        githubUrl={p.githubUrl}
        onSetTab={p.setTab}
        onRunStart={() => p.setTab("findings")}
        onRunsStarted={() => p.invalidateActiveRuns()}
      />

      <div style={bodyWrap}>
        {p.tab === "overview" && <OverviewTab prBody={pr.body} />}

        {p.tab === "findings" && (
          <FindingsTab
            prId={p.prId}
            liveRunIds={p.liveRunIds}
            runs={p.runs}
            prRuns={p.prRuns}
            prCommits={pr.commits}
            repoFullName={p.repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={(id) => p.setTrace(id)}
            onDelete={(id) => {
              if (window.confirm("Delete this run from history? (its logs are removed too)"))
                p.deleteRun.mutate(id);
            }}
            onRunDone={() => {
              p.invalidateActiveRuns();
              p.invalidateRunHistory();
              p.refetchReviews();
            }}
          />
        )}

        {p.tab === "diff" && (
          <DiffTab
            prId={p.prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
          />
        )}
      </div>

      {p.prId && p.traceRunId && (
        <RunTraceDrawer
          runId={p.traceRunId}
          prNumber={pr.number}
          findings={p.runs.find((r) => r.run_id === p.traceRunId)?.findings ?? []}
          agentName={p.runs.find((r) => r.run_id === p.traceRunId)?.agent_name ?? null}
          onClose={() => p.setTrace(null)}
        />
      )}
    </AppShell>
  );
}
