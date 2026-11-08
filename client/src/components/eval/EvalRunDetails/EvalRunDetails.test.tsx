import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EvalRunDetail, Finding } from "@devdigest/shared";
import { EvalIntl } from "../test-kit";
import { evalCase, result, suiteRun, emptyOutput } from "../fixtures";
import { EvalRunDetails } from "./EvalRunDetails";

afterEach(cleanup);

const finding = (id: string, title: string): Finding => ({
  id,
  severity: "WARNING",
  category: "bug",
  title,
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  confidence: 0.9,
});

describe("EvalRunDetails", () => {
  it("renders per-case result, unmatched expectations, false positives and dropped findings as plain text (AC-55, AC-71)", () => {
    const evil = "[x](javascript:alert(1))";
    const detail: EvalRunDetail = {
      eval_run: suiteRun({ n: 1 }),
      results: [
        result({
          id: "r1",
          case_id: "c1",
          case_name: "<img src=x onerror=alert(1)>",
          pass: false,
          expected_count: 2,
          got_count: 1,
          actual_output: {
            ...emptyOutput,
            kept: [finding("f1", evil)],
            dropped: [{ finding: finding("f2", "ghost"), reason: "file not in diff" }],
            expectations: [
              { index: 0, matched: true, matched_finding_ids: [] },
              { index: 1, matched: false, matched_finding_ids: [] },
            ],
            finding_verdicts: [{ finding_id: "f1", verdict: "fp", hit_must_not_flag: false }],
          },
        }),
        result({ id: "r2", case_id: "c2", case_name: "broken", error: { reason: "invalid_output", message: "m" }, pass: false }),
      ],
    };
    const cases = [
      evalCase("c1", "x", null, {
        expected_output: [
          { expect: "must_find", file: "a.ts", start_line: 1 },
          { expect: "must_find", file: "b.ts", start_line: 7, title: "Missing check" },
        ],
      }),
    ];
    render(
      <EvalIntl>
        <EvalRunDetails detail={detail} cases={cases} />
      </EvalIntl>,
    );
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("b.ts:7 — Missing check")).toBeInTheDocument();
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(document.querySelector("a")).toBeNull();
    expect(screen.getByText("ghost · file not in diff")).toBeInTheDocument();
    expect(screen.getByText("error: invalid model output")).toBeInTheDocument();
    expect(screen.getByText("fail")).toBeInTheDocument();
  });
});
