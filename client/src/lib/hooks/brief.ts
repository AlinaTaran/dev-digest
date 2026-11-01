/* hooks/brief.ts — PR Brief (Overview). GET returns 200 with `brief: null` until the
   user generates one; POST runs the single model call (409/502 carry details.reason). */
"use client";

import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBriefResponse } from "../types";

type Id = string | null | undefined;

/** Poll cadence while a generation is in flight (AC-9). */
export const BRIEF_POLL_MS = 2000;

export const prBriefKey = (prId: Id) => ["pr-brief", prId] as const;

export function usePrBrief(prId: Id) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: prId != null,
    refetchInterval: (q) => (q.state.data?.generating ? BRIEF_POLL_MS : false),
  });
}

/** `details.reason` of a failed generate (409 / 502), else "unknown". */
export function briefErrorReason(error: unknown): string {
  if (error instanceof ApiError && error.details && typeof error.details === "object") {
    const reason = (error.details as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return "unknown";
}

export function useGeneratePrBrief(prId: Id) {
  const qc = useQueryClient();
  // Synchronous guard: two clicks in one tick both see a stale `isPending === false`.
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief/generate`),
    onSuccess: (data) => qc.setQueryData(prBriefKey(prId), data),
    onSettled: () => qc.invalidateQueries({ queryKey: prBriefKey(prId) }),
  });

  const generate = () => {
    if (inFlight.current || prId == null) return;
    inFlight.current = true;
    mutation.mutate(undefined, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  return {
    generate,
    isPending: mutation.isPending,
    error: mutation.error,
    errorReason: mutation.error ? briefErrorReason(mutation.error) : null,
  };
}
