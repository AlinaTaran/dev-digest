/* Shared state for the skill's eval runs: the host agent (default + user pick), run start, the
   attached active run and its progress. Used by both the Evals tab and the header "Run on evals". */
"use client";

import { useState } from "react";
import type { Agent, EvalSuiteRun, Skill } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useSkillStats } from "@/lib/hooks/skills";
import {
  evalRunUnavailableReason,
  useEvalRun,
  useSkillEvalCases,
  useSkillEvalRuns,
  useStartSkillEvalRun,
} from "@/lib/hooks/eval";
import { defaultHostAgent, noticeForReason, type SkillRunNotice } from "./helpers";

export interface SkillEvalRunner {
  enabledAgents: Agent[];
  hostId: string | null;
  setHostId: (id: string) => void;
  runs: EvalSuiteRun[];
  start: () => void;
  starting: boolean;
  notice: SkillRunNotice;
  clearNotice: () => void;
  setNotice: (n: SkillRunNotice) => void;
  progress: { done: number; total: number } | null;
  failedReason: string | null | undefined;
}

export function useSkillEvalRunner(skill: Skill): SkillEvalRunner {
  const agents = useAgents();
  const stats = useSkillStats(skill.id);
  const runsQuery = useSkillEvalRuns(skill.id);
  const cases = useSkillEvalCases(skill.id);
  const startRun = useStartSkillEvalRun();

  const [picked, setPicked] = useState<string | null>(null);
  const [attachedRunId, setAttachedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<SkillRunNotice>(null);

  const runs = runsQuery.data ?? [];
  const enabledAgents = (agents.data ?? []).filter((a) => a.enabled);
  const fallback = defaultHostAgent({
    agents: agents.data ?? [],
    linkedAgentIds: (stats.data?.agents ?? []).map((a) => a.id),
    runs,
  });
  const hostId = picked && enabledAgents.some((a) => a.id === picked) ? picked : (fallback?.id ?? null);

  // Attach to an already-running suite (page reload / another tab) as well as our own.
  const activeRunId = attachedRunId ?? runs.find((r) => r.status === "running")?.id ?? null;
  const active = useEvalRun(activeRunId);
  const activeRun = active.data?.eval_run;
  const casesTotal = (cases.data ?? []).length;

  const progress =
    activeRunId && (!activeRun || activeRun.status === "running")
      ? { done: activeRun?.cases_done ?? 0, total: activeRun?.cases_total ?? casesTotal }
      : startRun.isPending
        ? { done: 0, total: casesTotal }
        : null;

  const start = () => {
    setNotice(null);
    if (!hostId) {
      setNotice("no_host_agent");
      return;
    }
    startRun.mutate(
      { skillId: skill.id, hostAgentId: hostId },
      {
        onSuccess: (outcome) => {
          if (outcome.kind === "in_progress") setNotice("in_progress");
          setAttachedRunId(outcome.kind === "started" ? outcome.run.id : outcome.activeRunId);
        },
        onError: (e) => setNotice(noticeForReason(evalRunUnavailableReason(e))),
      },
    );
  };

  return {
    enabledAgents,
    hostId,
    setHostId: setPicked,
    runs,
    start,
    starting: startRun.isPending,
    notice,
    clearNotice: () => setNotice(null),
    setNotice,
    progress,
    failedReason: activeRun?.status === "failed" ? (activeRun.error_reason ?? "") : undefined,
  };
}
