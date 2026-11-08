import type { Agent, EvalSuiteRun, EvalTrendPoint } from "@devdigest/shared";
import type { RunEvalNotice } from "@/components/eval/RunEvalButton/RunEvalButton";

export type SkillRunNotice = RunEvalNotice | "no_host_agent";

const byName = (a: Agent, b: Agent) => a.name.localeCompare(b.name);

/** Default host agent (spec Q13): last host used → first enabled linked agent → first enabled agent.
    A last host that was deleted or disabled falls through to the next rule (EC-31). */
export function defaultHostAgent(input: {
  agents: Agent[];
  linkedAgentIds: string[];
  runs: Pick<EvalSuiteRun, "agent_id" | "started_at">[];
}): Agent | null {
  const enabled = input.agents.filter((a) => a.enabled).sort(byName);
  const lastRun = [...input.runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  const last = lastRun?.agent_id ? enabled.find((a) => a.id === lastRun.agent_id) : undefined;
  if (last) return last;
  return enabled.find((a) => input.linkedAgentIds.includes(a.id)) ?? enabled[0] ?? null;
}

/** Finished runs with metrics (`done` | `partial`), newest first. */
export function finishedRuns(runs: EvalSuiteRun[]): EvalSuiteRun[] {
  return runs
    .filter((r) => (r.status === "done" || r.status === "partial") && r.metrics)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/** Trend points (oldest first) for finished skill runs; `agent_version` carries the skill's vN. */
export function trendPoints(finished: EvalSuiteRun[]): EvalTrendPoint[] {
  return [...finished].reverse().flatMap((r) =>
    r.metrics
      ? [
          {
            run_id: r.id,
            agent_version: r.owner_version,
            ran_at: r.started_at,
            recall: r.metrics.recall,
            precision: r.metrics.precision,
            citation_accuracy: r.metrics.citation_accuracy,
            pass_rate: r.metrics.traces_total ? r.metrics.traces_passed / r.metrics.traces_total : 0,
            cost_usd: r.metrics.cost_usd,
          },
        ]
      : [],
  );
}

/** Maps an `eval_run_unavailable` reason onto the inline notice. */
export function noticeForReason(reason: string | undefined): SkillRunNotice {
  if (
    reason === "llm_not_configured" ||
    reason === "no_cases" ||
    reason === "too_many_cases" ||
    reason === "no_host_agent"
  )
    return reason;
  return null;
}
