/* eval/case-state.ts — derive a case row's display state from its last result. */
import type { EvalCaseView, EvalCaseResult, EvalExpectation } from "@devdigest/shared";

export type CaseState = "passed" | "failed" | "error" | "never";

export function caseState(last: EvalCaseResult | null | undefined): CaseState {
  if (!last) return "never";
  if (last.error) return "error";
  return last.pass ? "passed" : "failed";
}

export interface CaseSubtitle {
  state: CaseState;
  expected?: number;
  got?: number;
  errorReason?: string;
}

export function caseSubtitle(last: EvalCaseResult | null | undefined): CaseSubtitle {
  const state = caseState(last);
  if (!last) return { state };
  if (last.error) return { state, errorReason: last.error.reason };
  return { state, expected: last.expected_count, got: last.got_count };
}

export type ChipData =
  | { kind: "empty" }
  | { kind: "must_not_flag" }
  | { kind: "must_find"; label: string };

/** Chip for the first expectation (AC-15): "empty []", "must not flag", or severity/category. */
export function firstExpectationChip(expected: EvalExpectation[]): ChipData {
  const first = expected[0];
  if (!first) return { kind: "empty" };
  if (first.expect === "must_not_flag") return { kind: "must_not_flag" };
  const label = [first.severity, first.category].filter(Boolean).join(" · ") || first.file;
  return { kind: "must_find", label };
}

/** Passing/total over cases whose last result passed (AC-16). */
export function passingCount(cases: EvalCaseView[]): { passed: number; total: number } {
  return { passed: cases.filter((c) => caseState(c.last_result) === "passed").length, total: cases.length };
}
