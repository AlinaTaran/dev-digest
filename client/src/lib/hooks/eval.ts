/* hooks/eval.ts — React Query hooks for the eval pipeline (agent side): eval cases,
   single-case runs, suite runs (with polling) and the dashboards.
   Global staleTime is 30s, so every mutation invalidates exactly the keys it affects. */
"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  EvalCaseView,
  EvalCaseResult,
  EvalDashboard,
  EvalOverview,
  EvalRunDetail,
  EvalSuiteRun,
  CreateEvalCaseBody,
  UpdateEvalCaseBody,
  FindingEvalCaseResponse,
  StartEvalRunResponse,
  RunAllEvalResponse,
  EvalTargets,
  FindingEvalCaseBody,
  EvalCaseUnavailableReason,
  EvalRunUnavailableReason,
} from "@devdigest/shared";

type Id = string | null | undefined;
type OwnerKind = "agent" | "skill";

export const EVAL_POLL_MS = 2000;

const casesKey = (kind: OwnerKind, ownerId: Id) => ["eval-cases", kind, ownerId] as const;

/** Runs + overview + agent dashboards + cases (last results) — everything a finished run changes. */
function invalidateRunData(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["eval-runs"] }),
    qc.invalidateQueries({ queryKey: ["eval-overview"] }),
    qc.invalidateQueries({ queryKey: ["agent-eval-dashboard"] }),
    qc.invalidateQueries({ queryKey: ["eval-cases"] }),
  ]);
}

function invalidateCaseData(qc: QueryClient, caseId?: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["eval-cases"] }),
    caseId ? qc.invalidateQueries({ queryKey: ["eval-case", caseId] }) : Promise.resolve(),
  ]);
}

/** Reads `details[key]` off a 409 ApiError, or undefined for any other error. */
function conflictDetail<T>(e: unknown, code: string, key: string): T | undefined {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== code) return undefined;
  return (e.details as Record<string, unknown> | undefined)?.[key] as T | undefined;
}

// ---------------------------------------------------------------- cases

export function useAgentEvalCases(agentId: Id) {
  return useQuery({
    queryKey: casesKey("agent", agentId),
    queryFn: () => api.get<EvalCaseView[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useSkillEvalCases(skillId: Id) {
  return useQuery({
    queryKey: casesKey("skill", skillId),
    queryFn: () => api.get<EvalCaseView[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

export function useEvalCase(id: Id) {
  return useQuery({
    queryKey: ["eval-case", id],
    queryFn: () => api.get<EvalCaseView>(`/eval-cases/${id}`),
    enabled: !!id,
  });
}

export function useCreateAgentEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, ...body }: CreateEvalCaseBody & { agentId: string }) =>
      api.post<EvalCaseView>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => invalidateCaseData(qc),
  });
}

export function useCreateSkillEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, ...body }: CreateEvalCaseBody & { skillId: string }) =>
      api.post<EvalCaseView>(`/skills/${skillId}/eval-cases`, body),
    onSuccess: () => invalidateCaseData(qc),
  });
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateEvalCaseBody & { id: string }) =>
      api.put<EvalCaseView>(`/eval-cases/${id}`, body),
    onSuccess: (_d, v) => invalidateCaseData(qc, v.id),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["eval-case", id] });
      return invalidateCaseData(qc);
    },
  });
}

/** Run one case synchronously (≤90 s). A model failure is still a 200 with `error` set. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hostAgentId }: { id: string; hostAgentId?: string }) =>
      api.post<EvalCaseResult>(`/eval-cases/${id}/run`, hostAgentId ? { host_agent_id: hostAgentId } : undefined),
    onSuccess: (_d, v) => invalidateCaseData(qc, v.id),
  });
}

export type EvalCaseFromFindingResult = FindingEvalCaseResponse;

/** `findingId` alone targets the finding's own agent; `target` picks a linked skill instead. */
export type EvalCaseFromFindingInput = string | { findingId: string; target?: FindingEvalCaseBody };

/** "Turn into eval case". 409 `eval_case_unavailable` surfaces as `reasonOf(error)`. */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseFromFindingInput) => {
      const { findingId, target } = typeof input === "string" ? { findingId: input, target: undefined } : input;
      const path = `/findings/${findingId}/eval-case`;
      // No body → one-argument call (the FindingCard test asserts exactly that).
      return target === undefined
        ? api.post<FindingEvalCaseResponse>(path)
        : api.post<FindingEvalCaseResponse>(path, target);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases"] }),
  });
}

/** Where a finding can become an eval case: its agent and the skills linked to that agent. */
export function useEvalTargets(findingId: Id) {
  return useQuery({
    queryKey: ["eval-targets", findingId],
    queryFn: () => api.get<EvalTargets>(`/findings/${findingId}/eval-targets`),
    enabled: !!findingId,
  });
}

export function evalCaseUnavailableReason(e: unknown): EvalCaseUnavailableReason | undefined {
  return conflictDetail<EvalCaseUnavailableReason>(e, "eval_case_unavailable", "reason");
}

export function evalRunUnavailableReason(e: unknown): EvalRunUnavailableReason | undefined {
  return conflictDetail<EvalRunUnavailableReason>(e, "eval_run_unavailable", "reason");
}

// ----------------------------------------------------------------- runs

export function useAgentEvalRuns(agentId: Id, days = 30) {
  return useQuery({
    queryKey: ["eval-runs", "agent", agentId, days],
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval-runs?days=${days}`),
    enabled: !!agentId,
  });
}

export function useSkillEvalRuns(skillId: Id, days = 30) {
  return useQuery({
    queryKey: ["eval-runs", "skill", skillId, days],
    queryFn: () => api.get<EvalSuiteRun[]>(`/skills/${skillId}/eval-runs?days=${days}`),
    enabled: !!skillId,
  });
}

/** One suite run + its case results. Polls every 2 s while `running`, and on the first
    terminal status invalidates the run-derived data exactly once. */
export function useEvalRun(id: Id) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-run", id],
    queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.eval_run.status === "running" ? EVAL_POLL_MS : false),
  });

  const status = query.data?.eval_run.status;
  const seenRunning = useRef(false);
  useEffect(() => {
    if (status === "running") {
      seenRunning.current = true;
    } else if (status && seenRunning.current) {
      seenRunning.current = false;
      void invalidateRunData(qc);
    }
  }, [status, qc]);

  return query;
}

export type StartEvalRunOutcome =
  | { kind: "started"; run: EvalSuiteRun }
  | { kind: "in_progress"; activeRunId: string };

/** POST a start-run request and fold 409 `eval_run_in_progress` into `{kind:"in_progress"}`. */
function startRun(path: string, body?: unknown): Promise<StartEvalRunOutcome> {
  return (body === undefined ? api.post<StartEvalRunResponse>(path) : api.post<StartEvalRunResponse>(path, body))
    .then((res): StartEvalRunOutcome => ({ kind: "started", run: res.eval_run }))
    .catch((e: unknown): StartEvalRunOutcome => {
      const active = conflictDetail<string>(e, "eval_run_in_progress", "active_run_id");
      if (active) return { kind: "in_progress", activeRunId: active };
      throw e;
    });
}

/** Same-tick double clicks share one request (`isPending` lags a render). */
function useDedupedStart<V>(start: (v: V) => Promise<StartEvalRunOutcome>) {
  const qc = useQueryClient();
  const inFlight = useRef<Promise<StartEvalRunOutcome> | null>(null);
  return useMutation({
    mutationFn: (v: V): Promise<StartEvalRunOutcome> => {
      if (inFlight.current) return inFlight.current;
      const p = start(v).finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
      return p;
    },
    onSuccess: () => invalidateRunData(qc),
  });
}

/** Start a suite run. 409 `eval_run_in_progress` resolves to `{kind:"in_progress", activeRunId}`
    (so the UI can attach to the active run); 409 `eval_run_unavailable` rejects — read the
    reason with `evalRunUnavailableReason(error)`. */
export function useStartAgentEvalRun() {
  return useDedupedStart((agentId: string) => startRun(`/agents/${agentId}/eval-runs`));
}

/** Start a skill suite run on a host agent (required). Same outcome/409 contract as the agent variant. */
export function useStartSkillEvalRun() {
  return useDedupedStart(({ skillId, hostAgentId }: { skillId: string; hostAgentId: string }) =>
    startRun(`/skills/${skillId}/eval-runs`, { host_agent_id: hostAgentId }),
  );
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunAllEvalResponse>(`/eval-runs`, { all: true }),
    onSuccess: () => invalidateRunData(qc),
  });
}

// ----------------------------------------------------------- dashboards

export function useEvalOverview(days?: number) {
  return useQuery({
    queryKey: days ? ["eval-overview", days] : ["eval-overview"],
    queryFn: () => api.get<EvalOverview>(days ? `/eval/dashboard?days=${days}` : `/eval/dashboard`),
  });
}

export function useAgentEvalDashboard(agentId: Id, days = 30) {
  return useQuery({
    queryKey: ["agent-eval-dashboard", agentId, days],
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard?days=${days}`),
    enabled: !!agentId,
  });
}
