import type { AgentColumn, FindingGroup, FindingRecord, Severity } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { formatCost } from "@/lib/format";

export interface GroupCell {
  agentName: string;
  /** Null when the agent did not flag this group. */
  severity: Severity | null;
  title: string | null;
}

/** One cell per DONE column: the agent's finding within the group, or "did not flag". */
export function cellsForGroup(group: FindingGroup, columns: AgentColumn[]): GroupCell[] {
  const ids = new Set(group.finding_ids);
  return columns
    .filter((c) => c.status === "done")
    .map((c) => {
      const hit = c.findings.find((f) => ids.has(f.id));
      return {
        agentName: c.agent_name,
        severity: hit ? hit.severity : null,
        title: hit ? hit.title : null,
      };
    });
}

/** Names of the agents (columns) that flagged a group. */
export function agentsForGroup(group: FindingGroup, columns: AgentColumn[]): string[] {
  const ids = new Set(group.finding_ids);
  return columns.filter((c) => c.findings.some((f) => ids.has(f.id))).map((c) => c.agent_name);
}

/** Other agents (not `column`) that flagged a group containing `finding`. */
export function alsoFoundBy(
  finding: FindingRecord,
  column: AgentColumn,
  groups: FindingGroup[],
  columns: AgentColumn[],
): string[] {
  const group = groups.find((g) => g.finding_ids.includes(finding.id));
  if (!group) return [];
  return agentsForGroup(group, columns).filter((n) => n !== column.agent_name);
}

export function formatSeconds(ms: number | null | undefined): string {
  return ((ms ?? 0) / 1000).toFixed(1);
}

/** Header cost: two decimals from a cent up (e.g. "$0.20"), adaptive below. */
export function formatTotalCost(usd: number | null | undefined): string {
  if (usd != null && usd >= 0.01) return `$${usd.toFixed(2)}`;
  return formatCost(usd);
}

export function isDecided(f: FindingRecord): boolean {
  return !!f.accepted_at || !!f.dismissed_at;
}

export type RunStatusKey = AgentColumn["status"];

/** Score band -> theme token (mirrors CircularScore: >=75 ok, >=50 warn, else crit). */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-muted)";
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}

export function severityColor(severity: Severity): string {
  return severity === "CRITICAL" ? "var(--crit)" : severity === "WARNING" ? "var(--warn)" : "var(--sugg)";
}

/** Accent color for a column: status wins over score for non-done runs. */
export function columnAccent(c: AgentColumn): string {
  if (c.status === "running") return "var(--accent)";
  if (c.status === "failed") return "var(--crit)";
  if (c.status === "cancelled") return "var(--text-muted)";
  return scoreColor(c.score);
}

export function statusColor(status: RunStatusKey): string {
  return status === "running"
    ? "var(--accent)"
    : status === "done"
      ? "var(--ok)"
      : status === "failed"
        ? "var(--crit)"
        : "var(--text-muted)";
}

/** Tinted border: the accent mixed into the neutral border (theme-safe). */
export function tintedBorder(color: string): string {
  return `color-mix(in srgb, ${color} 55%, var(--border))`;
}

/** Icon for an agent, picked from its name; falls back to a generic chip. */
export function agentIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (n.includes("secur")) return "Shield";
  if (n.includes("perf")) return "Zap";
  if (n.includes("junior") || n.includes("mentor")) return "Lightbulb";
  if (n.includes("customer")) return "Users";
  if (n.includes("arch")) return "Boxes";
  return "Cpu";
}
