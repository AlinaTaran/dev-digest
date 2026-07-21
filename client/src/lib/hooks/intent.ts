/* hooks/intent.ts — PR intent card (F2/Intent Layer). GET /pulls/:id/intent is
   lazy on the server (computes + caches on first view), so the query being
   in-flight IS the "generating" state — no client-side auto-POST needed. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentBrief } from "../types";

export function useIntent(prId: string | null) {
  return useQuery({
    queryKey: ["pull-intent", prId],
    queryFn: () => api.get<PrIntentBrief>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

export function useRecomputeIntent(prId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentBrief>(`/pulls/${prId}/intent/recompute`),
    onSuccess: (data) => qc.setQueryData(["pull-intent", prId], data),
  });
}
