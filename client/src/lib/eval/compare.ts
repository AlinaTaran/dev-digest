/* eval/compare.ts — pure helpers behind the "Compare runs" modal. */
import type { EvalSuiteRun } from "@devdigest/shared";

export type SnapshotField = "model" | "provider" | "strategy" | "skills" | "host_agent" | "host_prompt";
export interface SnapshotDifference {
  field: SnapshotField;
  from: string;
  to: string;
}

const skillsLabel = (s: EvalSuiteRun["config_snapshot"]["skills"]): string =>
  s
    .map((k) => `${k.id}@v${k.version}`)
    .sort()
    .join(", ");

/**
 * Config fields that differ between two run snapshots (model/provider/strategy/skills ids+versions).
 * In `skill` mode the snapshot's agent is the host, so a changed host agent and a changed host system
 * prompt are listed too (AC-84) — in agent mode the prompt diff is shown separately instead.
 */
export function snapshotDifferences(a: EvalSuiteRun, b: EvalSuiteRun, mode: "agent" | "skill" = "agent"): SnapshotDifference[] {
  const sa = a.config_snapshot;
  const sb = b.config_snapshot;
  const out: SnapshotDifference[] = [];
  if (mode === "skill") {
    if ((a.agent_id ?? null) !== (b.agent_id ?? null) || sa.agent_name !== sb.agent_name) {
      out.push({ field: "host_agent", from: a.host_agent_name ?? sa.agent_name, to: b.host_agent_name ?? sb.agent_name });
    }
    if (sa.system_prompt !== sb.system_prompt) out.push({ field: "host_prompt", from: "", to: "" });
  }
  if (sa.model !== sb.model) out.push({ field: "model", from: sa.model, to: sb.model });
  if (sa.provider !== sb.provider) out.push({ field: "provider", from: sa.provider, to: sb.provider });
  if (sa.strategy !== sb.strategy) out.push({ field: "strategy", from: sa.strategy, to: sb.strategy });
  const ka = skillsLabel(sa.skills);
  const kb = skillsLabel(sb.skills);
  if (ka !== kb) out.push({ field: "skills", from: ka, to: kb });
  return out;
}

/** Case ids added/removed going from run A's set to run B's. */
export function caseSetChange(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return { added: b.filter((id) => !sa.has(id)), removed: a.filter((id) => !sb.has(id)) };
}

/** Order two runs older → newer by `started_at`. */
export function orderRuns<T extends { started_at: string }>(a: T, b: T): [T, T] {
  return Date.parse(a.started_at) <= Date.parse(b.started_at) ? [a, b] : [b, a];
}

/** True when two skill runs were executed by different host agents (their metrics aren't strictly comparable). */
export function hostAgentsDiffer(a: EvalSuiteRun, b: EvalSuiteRun): boolean {
  return (a.agent_id ?? null) !== (b.agent_id ?? null);
}
