/* Pure helpers for per-agent run estimates (GET /agents/estimates). */
import type { AgentEstimate } from "@devdigest/shared";
import { formatCost } from "./format";

const DASH = "—";

/** 6120 → "~6s"; null/invalid → "—". */
export function formatDurationShort(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  return `~${Math.round(ms / 1000)}s`;
}

/** Card/row estimate: "~6s · $0.05"; "—" when the agent has no duration history. */
export function formatCardEstimate(e: AgentEstimate | undefined): string {
  if (!e || e.mean_duration_ms == null) return DASH;
  return `${formatDurationShort(e.mean_duration_ms)} · ${formatCost(e.mean_cost_usd)}`;
}

/** Parallel fan-out total: longest duration, summed cost; unknown values are skipped. */
export function estimateTotal(
  selectedIds: string[],
  estimates: AgentEstimate[] | undefined,
): { maxMs: number | null; sumUsd: number | null } {
  const byId = new Map((estimates ?? []).map((e) => [e.agent_id, e]));
  let maxMs: number | null = null;
  let sumUsd: number | null = null;
  for (const id of selectedIds) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.mean_duration_ms != null) maxMs = Math.max(maxMs ?? 0, e.mean_duration_ms);
    if (e.mean_cost_usd != null) sumUsd = (sumUsd ?? 0) + e.mean_cost_usd;
  }
  return { maxMs, sumUsd };
}

/** One decimal for the total duration ("8.2s"), "—" when unknown. */
export function formatTotalDuration(ms: number | null): string {
  return ms == null ? DASH : `${(ms / 1000).toFixed(1)}s`;
}

/** Total cost, two decimals from a cent up ("$0.20"); sub-cent falls back to formatCost. */
export function formatTotalCost(usd: number | null): string {
  if (usd == null) return DASH;
  return usd >= 0.01 ? `$${usd.toFixed(2)}` : formatCost(usd);
}
