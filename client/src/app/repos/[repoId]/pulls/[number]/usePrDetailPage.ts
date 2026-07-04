/* Orchestration for the PR-detail route — number→uuid resolution, all the
   PR/review/run queries, live-run tracking, cache invalidation, and URL view
   state (?tab, ?trace). Keeps page.tsx a thin shell that just renders. */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrReviews, usePrActiveRuns, usePrRuns, useDeleteRun } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { githubPrUrl } from "@/lib/github-urls";

export function usePrDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);

  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  };

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings = runs.flatMap((r) => r.findings);
  const repoFullName = activeRepo?.full_name ?? null;

  return {
    repoId,
    number,
    repoNotFound,
    pr,
    prId,
    isLoading,
    isError,
    error,
    refetch,
    tab,
    setTab: (t: string) => setParam("tab", t),
    traceRunId,
    setTrace: (id: string | null) => setParam("trace", id),
    runs,
    prRuns,
    liveRunIds,
    findingsCount: allFindings.length,
    deleteRun,
    refetchReviews,
    invalidateActiveRuns,
    invalidateRunHistory,
    repoName: activeRepo?.full_name ?? repoId,
    repoFullName,
    githubUrl: pr && repoFullName ? githubPrUrl(repoFullName, pr.number) : null,
  };
}
