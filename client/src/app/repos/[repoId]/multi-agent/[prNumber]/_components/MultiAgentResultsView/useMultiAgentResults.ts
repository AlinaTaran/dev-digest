/* View hook for the multi-agent results page: number→uuid resolution, the polled
   run query, and view state (mode, selected tab, conflicts filter, trace panel). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { usePulls } from "@/lib/hooks";
import { useMultiAgentRun, useGroupFindingAction } from "@/lib/hooks/multi-agent-run";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";

export type ResultsMode = "tabs" | "columns";

export function useMultiAgentResults() {
  const { repoId, prNumber } = useParams<{ repoId: string; prNumber: string }>();
  const { activeRepo } = useActiveRepo();
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const pr = pulls?.find((p) => p.number === Number(prNumber)) ?? null;
  const prId = pr?.id ?? null;

  const run = useMultiAgentRun(prId);
  const action = useGroupFindingAction(prId);

  const [mode, setMode] = React.useState<ResultsMode>("tabs");
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [showOnlyConflicts, setShowOnlyConflicts] = React.useState(false);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  const columns = run.data?.columns ?? [];
  // Derive the active tab: explicit choice if still present, else the first column.
  const activeColumn = columns.find((c) => c.run_id === selectedRunId) ?? columns[0] ?? null;
  const traceColumn = columns.find((c) => c.run_id === traceRunId) ?? null;

  return {
    repoId,
    prNumber: Number(prNumber),
    repoName: activeRepo?.full_name ?? repoId,
    repoFullName: activeRepo?.full_name ?? null,
    pr,
    pullsLoading,
    run: run.data ?? null,
    runLoading: prId != null && run.isLoading,
    noRun: run.error instanceof ApiError && run.error.status === 404,
    action,
    mode,
    setMode,
    activeColumn,
    setSelectedRunId,
    showOnlyConflicts,
    setShowOnlyConflicts,
    traceColumn,
    openTrace: setTraceRunId,
    closeTrace: () => setTraceRunId(null),
  };
}
