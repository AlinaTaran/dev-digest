/* hooks/pr-history.ts — prior PRs touching a PR's files (GET /pulls/:id/history).
   Lazy: the section passes `enabled=false` until expanded, so collapsed panels never hit git. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistoryResponse } from "../types";

export const prHistoryKey = (prId: string | null) => ["pr-history", prId] as const;

export function usePrHistory(prId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: prHistoryKey(prId),
    queryFn: () => api.get<PrHistoryResponse>(`/pulls/${prId}/history`),
    enabled: prId != null && enabled,
    staleTime: 5 * 60_000,
  });
}
