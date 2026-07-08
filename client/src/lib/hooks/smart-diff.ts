/* hooks/smart-diff.ts — Smart Diff (risk-ordered "Files changed" view). The
   endpoint is a deterministic composition of already-persisted data (pr_files +
   the latest review's findings) — no LLM call, so this is a plain GET query,
   mirroring usePullDetail. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "../types";

export function useSmartDiff(prId: string | null) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: prId != null,
  });
}
