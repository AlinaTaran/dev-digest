/* hooks/blast.ts — PR blast radius (GET /pulls/:id/blast) + the Resync flow that
   refreshes it. Resync = POST /repos/:id/resync (202, async); completion is
   detected by the repo-intel `updatedAt` advancing, then the blast + history
   caches are invalidated. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "../types";
import { prHistoryKey } from "./pr-history";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";

const RESYNC_TIMEOUT_MS = 120_000;

export const blastRadiusKey = (prId: string | null) => ["blast-radius", prId] as const;

export function useBlastRadius(prId: string | null) {
  return useQuery({
    queryKey: blastRadiusKey(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: prId != null,
  });
}

export function useBlastResync(prId: string | null, repoId: string | null) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [resyncing, setResyncing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const baseline = useRef<string | undefined>(undefined);
  const status = useRepoIntelStatus(repoId, resyncing);
  const updatedAt = status.data?.updatedAt;
  const latest = useRef(updatedAt);
  latest.current = updatedAt;
  // Without a loaded index state there is no baseline to compare against, so the
  // first poll would look like completion. Block start until it has loaded.
  const canStart = updatedAt !== undefined;

  // Completion: the polled index state advanced past the pre-click baseline.
  useEffect(() => {
    if (resyncing && updatedAt !== baseline.current) {
      setResyncing(false);
      qc.invalidateQueries({ queryKey: blastRadiusKey(prId) });
      qc.invalidateQueries({ queryKey: prHistoryKey(prId) });
    }
  }, [resyncing, updatedAt, prId, qc]);

  // Give up polling after a bounded wait.
  useEffect(() => {
    if (!resyncing) return;
    const id = setTimeout(() => {
      setResyncing(false);
      setTimedOut(true);
    }, RESYNC_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [resyncing]);

  const start = () => {
    if (latest.current === undefined) return;
    baseline.current = latest.current;
    setTimedOut(false);
    resync.mutate(undefined, { onSuccess: () => setResyncing(true) });
  };

  return { start, canStart, isResyncing: resync.isPending || resyncing, timedOut, isError: resync.isError };
}
