/* Test fixtures for the eval components. */
import type { EvalCaseView, EvalCaseResult, EvalSuiteRun } from "@devdigest/shared";

export const emptyOutput: EvalCaseResult["actual_output"] = {
  kept: [],
  dropped: [],
  expectations: [],
  finding_verdicts: [],
};

export function result(over: Partial<EvalCaseResult> = {}): EvalCaseResult {
  return {
    id: "res-1",
    case_id: "c1",
    case_name: "case",
    suite_run_id: null,
    ran_at: "2026-05-29T09:14:00Z",
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    expected_count: 1,
    got_count: 1,
    error: null,
    duration_ms: 1200,
    cost_usd: 0.01,
    actual_output: emptyOutput,
    ...over,
  };
}

export function evalCase(id: string, name: string, last: EvalCaseResult | null, over: Partial<EvalCaseView> = {}): EvalCaseView {
  return {
    id,
    owner_kind: "agent",
    owner_id: "agent-1",
    name,
    input_diff: "",
    input_files: [],
    input_meta: { repo: "r", pr_number: 1, title: "t", body: "", head_sha: "x", source: null },
    expected_output: [{ expect: "must_find", file: "a.ts", start_line: 1, severity: "CRITICAL", category: "security" }],
    notes: null,
    source_finding_id: null,
    created_at: "2026-05-01T00:00:00Z",
    last_result: last,
    ...over,
  };
}

export function suiteRun(over: Partial<EvalSuiteRun> & { n?: number } = {}): EvalSuiteRun {
  const { n = 1, ...rest } = over;
  return {
    id: `run-${n}`,
    owner_kind: "agent",
    owner_id: "agent-1",
    owner_version: n,
    agent_id: "agent-1",
    agent_version: n,
    status: "done",
    started_at: `2026-05-${String(10 + n).padStart(2, "0")}T09:14:00Z`,
    finished_at: `2026-05-${String(10 + n).padStart(2, "0")}T09:20:00Z`,
    cases_total: 20,
    cases_done: 20,
    cases_errored: 0,
    metrics: {
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      traces_passed: 17,
      traces_total: 20,
      duration_ms: 1000,
      cost_usd: 0.23,
      per_trace: [],
    },
    config_snapshot: {
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a reviewer.",
      strategy: "single",
      skills: [],
      agent_name: "Security Reviewer",
      skill_body: null,
    },
    case_ids: ["c1"],
    error_reason: null,
    ...rest,
  };
}
