/* hooks/onboarding.ts — React Query hooks for the per-repo Onboarding Tour:
   the tour + generation state, and the background-generate trigger. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
import type { OnboardingTourResponse, OnboardingGenerateResponse } from "@devdigest/shared";

type Id = string | null | undefined;

/** Poll cadence while a generation is in flight (NFR-3). */
export const ONBOARDING_POLL_MS = 2000;

export const onboardingKey = (repoId: Id) => ["onboarding", repoId] as const;

export function useOnboardingTour(repoId: Id) {
  return useQuery({
    queryKey: onboardingKey(repoId),
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.generation?.status === "generating" ? ONBOARDING_POLL_MS : false),
  });
}

/** Start (or join) a generation. The cached tour is merged with the new generation
    immediately so the UI flips to "generating" before the refetch lands. */
export function useGenerateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<OnboardingGenerateResponse>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (d, repoId) => {
      qc.setQueryData<OnboardingTourResponse>(onboardingKey(repoId), (old) =>
        old ? { ...old, generation: d.generation } : old,
      );
      return qc.invalidateQueries({ queryKey: onboardingKey(repoId) });
    },
  });
}

const RESYNC_TIMEOUT_MS = 120_000;

/** Resync the repo index from the Onboarding page. The POST is async (202), so completion is
    detected by the repo-intel `updatedAt` changing (same signal as `useBlastResync`); then the
    tour query is invalidated so the `no_index` empty state flips to the real availability. */
export function useOnboardingResync(repoId: string) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [resyncing, setResyncing] = useState(false);
  const baseline = useRef<string | undefined>(undefined);
  // Synchronous guard: two clicks in one tick both see a stale `isPending === false`.
  const inFlight = useRef(false);
  const status = useRepoIntelStatus(repoId, resyncing);
  const updatedAt = status.data?.updatedAt;
  const latest = useRef(updatedAt);
  latest.current = updatedAt;
  // Without a loaded index state there is no baseline, so the first poll would look
  // like completion (same guard as `useBlastResync`).
  const canStart = updatedAt !== undefined;

  useEffect(() => {
    if (resyncing && updatedAt !== baseline.current) {
      inFlight.current = false;
      setResyncing(false);
      qc.invalidateQueries({ queryKey: onboardingKey(repoId) });
    }
  }, [resyncing, updatedAt, repoId, qc]);

  // Bounded wait: refetch the tour anyway so the page never stays stale indefinitely.
  useEffect(() => {
    if (!resyncing) return;
    const id = setTimeout(() => {
      inFlight.current = false;
      setResyncing(false);
      qc.invalidateQueries({ queryKey: onboardingKey(repoId) });
    }, RESYNC_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [resyncing, repoId, qc]);

  const start = () => {
    if (inFlight.current || latest.current === undefined) return;
    inFlight.current = true;
    baseline.current = latest.current;
    resync.mutate(undefined, {
      onSuccess: () => setResyncing(true),
      onError: () => {
        inFlight.current = false;
      },
    });
  };

  return { start, canStart, isResyncing: resync.isPending || resyncing };
}
