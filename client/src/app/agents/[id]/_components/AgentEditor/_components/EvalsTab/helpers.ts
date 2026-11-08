import type { EvalSuiteRun } from "@devdigest/shared";
import type { RunEvalNotice } from "@/components/eval/RunEvalButton/RunEvalButton";

/** Finished runs with metrics (`done` | `partial`), newest first — the tiles' source (AC-47/48). */
export function finishedRuns(runs: EvalSuiteRun[]): EvalSuiteRun[] {
  return runs
    .filter((r) => (r.status === "done" || r.status === "partial") && r.metrics)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/** Maps a `eval_run_unavailable` reason onto the start button's inline notice. */
export function noticeForReason(reason: string | undefined): RunEvalNotice {
  if (reason === "llm_not_configured" || reason === "no_cases" || reason === "too_many_cases") return reason;
  return null;
}
