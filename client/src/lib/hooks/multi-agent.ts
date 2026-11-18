/* hooks/multi-agent.ts — estimates, recent multi-runs list + start a multi-agent run (not in the barrel). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentEstimate, MultiAgentRun, MultiAgentRunSummary } from "@devdigest/shared";

export function useAgentEstimates() {
  return useQuery({
    queryKey: ["agent-estimates"],
    queryFn: () => api.get<AgentEstimate[]>("/agents/estimates"),
  });
}

export const recentMultiRunsKey = (repoId: string | null | undefined) => ["multi-agent-runs", repoId] as const;

/** The repo's 10 latest multi-runs; refetched on mount, polled every 2 s only while one is running. */
export function useRecentMultiRuns(repoId: string | null | undefined) {
  return useQuery({
    queryKey: recentMultiRunsKey(repoId),
    queryFn: () => api.get<MultiAgentRunSummary[]>(`/repos/${repoId}/multi-agent-runs?limit=10`),
    enabled: !!repoId,
    refetchOnMount: "always",
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
}

export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiAgentRun>(`/pulls/${prId}/multi-agent-run`, { agent_ids: agentIds }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent-runs"] });
    },
  });
}
