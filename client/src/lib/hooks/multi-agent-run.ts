/* Hooks for the multi-agent results page: the PR's latest multi-run (polled
   every 2 s while running) and a bulk accept/dismiss over a finding group. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MultiAgentRun } from "@devdigest/shared";
import { api, ApiError } from "../api";

export const multiAgentKey = (prId: string | null | undefined) => ["multi-agent", prId] as const;

export function useMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: multiAgentKey(prId),
    queryFn: () => api.get<MultiAgentRun>(`/pulls/${prId}/multi-agent`),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
    // A 404 (no_multi_run) is a normal empty state, not worth retrying.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** Accept/dismiss every finding of a group (or one finding) with ONE refetch. */
export function useGroupFindingAction(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ findingIds, action }: { findingIds: string[]; action: "accept" | "dismiss" }) => {
      const results = await Promise.allSettled(findingIds.map((id) => api.post(`/findings/${id}/${action}`)));
      await qc.invalidateQueries({ queryKey: multiAgentKey(prId) });
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
    },
  });
}
