import { describe, it, expect } from "vitest";
import { pct, deltaPoints, costDelta } from "./format";
import { lineDiff, collapseUnchanged, isUnchanged } from "./line-diff";
import { snapshotDifferences, caseSetChange, orderRuns } from "./compare";
import { caseState, passingCount, firstExpectationChip } from "./case-state";
import { parseExpectationsJson, FINDING_SKELETON } from "./expectations-json";
import type { EvalSuiteRun, EvalCaseView, EvalCaseResult } from "@devdigest/shared";

describe("format", () => {
  it("formats percentages, deltas and cost deltas", () => {
    expect(pct(0.82)).toBe("82%");
    expect(pct(null)).toBe("—");
    expect(deltaPoints(0.86, 0.82)).toEqual({ points: 4, direction: "up", label: "▲ 4pt", a11y: "up 4 points" });
    expect(deltaPoints(0.8, 0.82)).toMatchObject({ direction: "down", label: "▼ 2pt", a11y: "down 2 points" });
    expect(deltaPoints(0.81, 0.8).a11y).toBe("up 1 point");
    expect(deltaPoints(0.5, 0.5).direction).toBe("flat");
    expect(costDelta(0.02, 0.01)).toBe("+$0.01");
    expect(costDelta(null, 0.01)).toBeNull();
  });
});

describe("lineDiff", () => {
  it("marks adds/dels, and collapses unchanged runs longer than 6 lines", () => {
    const same = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const a = ["old", ...same, "tail"].join("\n");
    const b = ["new", ...same, "tail"].join("\n");
    const d = lineDiff(a, b);
    expect(d.filter((l) => l.kind === "del").map((l) => l.text)).toEqual(["old"]);
    expect(d.filter((l) => l.kind === "add").map((l) => l.text)).toEqual(["new"]);
    const blocks = collapseUnchanged(d, 6);
    expect(blocks).toContainEqual({ type: "collapsed", count: 11 });
  });

  it("keeps short unchanged runs and detects identical input", () => {
    const d = lineDiff("a\nb\nc", "a\nx\nc");
    expect(collapseUnchanged(d, 6).every((b) => b.type === "lines")).toBe(true);
    expect(isUnchanged(lineDiff("same\ntext", "same\ntext"))).toBe(true);
    expect(lineDiff("", "x")).toEqual([{ kind: "add", text: "x" }]);
  });
});

const run = (over: Partial<EvalSuiteRun> & { skills?: EvalSuiteRun["config_snapshot"]["skills"] }): EvalSuiteRun =>
  ({
    started_at: "2026-01-01T00:00:00Z",
    case_ids: [],
    config_snapshot: { provider: "p", model: "m", strategy: "single", skills: over.skills ?? [] },
    ...over,
  }) as unknown as EvalSuiteRun;

describe("compare", () => {
  it("lists differing config fields and skill versions", () => {
    const a = run({ skills: [{ id: "s1", name: "S", version: 1 }] });
    const b = run({ skills: [{ id: "s1", name: "S", version: 2 }] });
    (b.config_snapshot as { model: string }).model = "m2";
    expect(snapshotDifferences(a, b)).toEqual([
      { field: "model", from: "m", to: "m2" },
      { field: "skills", from: "s1@v1", to: "s1@v2" },
    ]);
    expect(snapshotDifferences(a, a)).toEqual([]);
  });

  it("computes case-set change and orders runs older first", () => {
    expect(caseSetChange(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    const old = run({ started_at: "2026-01-01T00:00:00Z" });
    const nu = run({ started_at: "2026-02-01T00:00:00Z" });
    expect(orderRuns(nu, old)).toEqual([old, nu]);
  });
});

describe("case-state", () => {
  const res = (o: Partial<EvalCaseResult>) => o as EvalCaseResult;
  it("derives state, chip and passing count", () => {
    expect(caseState(null)).toBe("never");
    expect(caseState(res({ pass: true, error: null }))).toBe("passed");
    expect(caseState(res({ pass: false, error: null }))).toBe("failed");
    expect(caseState(res({ pass: false, error: { reason: "timeout", message: "" } }))).toBe("error");
    expect(firstExpectationChip([])).toEqual({ kind: "empty" });
    expect(firstExpectationChip([{ expect: "must_not_flag", file: "a", start_line: 1 }])).toEqual({
      kind: "must_not_flag",
    });
    const cases = [
      { last_result: res({ pass: true, error: null }) },
      { last_result: null },
    ] as EvalCaseView[];
    expect(passingCount(cases)).toEqual({ passed: 1, total: 2 });
  });
});

describe("parseExpectationsJson", () => {
  it("accepts valid input including the skeleton and an empty array", () => {
    expect(parseExpectationsJson("[]")).toEqual({ ok: true, value: [] });
    expect(parseExpectationsJson(JSON.stringify([FINDING_SKELETON])).ok).toBe(true);
  });

  it("reports the failing path", () => {
    expect(parseExpectationsJson("{").ok).toBe(false);
    expect(parseExpectationsJson("{}")).toMatchObject({ ok: false, path: "" });
    expect(parseExpectationsJson('[{"expect":"nope","file":"a","start_line":1}]')).toMatchObject({
      ok: false,
      path: "[0].expect",
    });
    expect(parseExpectationsJson('[{"expect":"must_find","file":"a","start_line":0}]')).toMatchObject({
      path: "[0].start_line",
    });
    expect(parseExpectationsJson('[{"expect":"must_find","file":"a","start_line":1,"x":1}]')).toMatchObject({
      path: "[0].x",
    });
  });
});

describe("snapshotDifferences — skill mode (AC-84)", () => {
  const run = (agent: string, prompt: string) =>
    ({
      agent_id: agent,
      host_agent_name: `Host ${agent}`,
      config_snapshot: { provider: "p", model: "m", strategy: "single", skills: [], system_prompt: prompt, agent_name: `Host ${agent}` },
    }) as unknown as EvalSuiteRun;
  it("adds host agent / host prompt changes only in skill mode", () => {
    const a = run("a1", "one");
    const b = run("a2", "two");
    expect(snapshotDifferences(a, b, "skill")).toEqual([
      { field: "host_agent", from: "Host a1", to: "Host a2" },
      { field: "host_prompt", from: "", to: "" },
    ]);
    expect(snapshotDifferences(a, b)).toEqual([]);
    expect(snapshotDifferences(a, run("a1", "one"), "skill")).toEqual([]);
  });
});
