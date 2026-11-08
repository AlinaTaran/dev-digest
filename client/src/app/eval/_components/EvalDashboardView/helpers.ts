import type { EvalOverview, RunAllEvalResponse } from "@devdigest/shared";
import { SPARKLINE_MAX_POINTS, RECENT_RUNS_LIMIT } from "./constants";

type AgentOverview = EvalOverview["agents"][number];
type RecentRun = EvalOverview["recent_runs"][number];

/** Cards open the agent's own eval dashboard (AC-60). */
export function agentHref(agentId: string): string {
  return `/eval/${agentId}`;
}

/** Last N points of the recall sparkline; null when there is nothing drawable (< 2 points). */
export function sparklinePoints(points: number[]): number[] | null {
  const tail = points.slice(-SPARKLINE_MAX_POINTS);
  return tail.length >= 2 ? tail : null;
}

/** Agents that have at least one case (AC-60). Defensive: the server already filters. */
export function agentsWithCases(agents: AgentOverview[]): AgentOverview[] {
  return agents.filter((a) => a.cases_total > 0);
}

/** Newest first, capped (AC-61). Sorts defensively; the server already orders. */
export function newestRuns(runs: RecentRun[]): RecentRun[] {
  return [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, RECENT_RUNS_LIMIT);
}

/** Unique skip reasons from a run-all response, in first-seen order. */
export function skipReasons(res: RunAllEvalResponse): RunAllEvalResponse["skipped"][number]["reason"][] {
  return [...new Set(res.skipped.map((x) => x.reason))];
}
