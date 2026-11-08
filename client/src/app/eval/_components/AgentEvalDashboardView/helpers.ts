import type { EvalDashboard, EvalSuiteRun } from "@devdigest/shared";
import type { RunEvalNotice } from "@/components/eval/RunEvalButton/RunEvalButton";
import { DEFAULT_PERIOD, PERIODS, type Period } from "./constants";

/** `?days=` → one of 7/30/90; anything else falls back to the default (30). */
export function parsePeriod(raw: string | null): Period {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : DEFAULT_PERIOD;
}

/** Finished runs with metrics (`done` | `partial`), newest first — the tiles' source. */
export function finishedRuns(runs: EvalSuiteRun[]): EvalSuiteRun[] {
  return runs
    .filter((r) => (r.status === "done" || r.status === "partial") && r.metrics)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/** Per-metric history (oldest first) for the tile sparklines, from the dashboard trend. */
export function sparklines(trend: EvalDashboard["trend"]) {
  return {
    recall: trend.map((p) => p.recall),
    precision: trend.map((p) => p.precision),
    citation_accuracy: trend.map((p) => p.citation_accuracy),
  };
}

/** Maps an `eval_run_unavailable` reason onto the start button's inline notice. */
export function noticeForReason(reason: string | undefined): RunEvalNotice {
  if (reason === "llm_not_configured" || reason === "no_cases" || reason === "too_many_cases") return reason;
  return null;
}
