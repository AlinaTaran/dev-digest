import { describe, expect, it } from "vitest";
import { alignVerdict } from "./llm-judge.js";

const PRACTICES = ["flags the fs import", "names core-no-node-io", "quotes the line verbatim"];

describe("alignVerdict", () => {
  it("scores against the practice count, not the number of results the judge returned", () => {
    const v = alignVerdict(PRACTICES, [{ practice: "flags the fs import", passed: true, evidence: "fs" }]);
    expect(v.total).toBe(3);
    expect(v.passed).toBe(1);
    expect(v.score).toBeCloseTo(1 / 3);
  });

  it("marks a practice the judge skipped as FAIL with an explanatory evidence", () => {
    const v = alignVerdict(PRACTICES, [{ practice: "flags the fs import", passed: true, evidence: "fs" }]);
    expect(v.results.map((r) => r.practice)).toEqual(PRACTICES);
    expect(v.results[1]).toMatchObject({ passed: false });
    expect(v.results[1].evidence).toMatch(/no verdict/i);
  });

  it("counts a pass only for a literal boolean true", () => {
    const v = alignVerdict(PRACTICES, [
      { practice: PRACTICES[0], passed: "false", evidence: "x" },
      { practice: PRACTICES[1], passed: "true", evidence: "x" },
      { practice: PRACTICES[2], passed: true, evidence: "x" },
    ]);
    expect(v.passed).toBe(1);
    expect(v.results.map((r) => r.passed)).toEqual([false, false, true]);
  });

  it("matches results by practice text regardless of order, case and whitespace", () => {
    const v = alignVerdict(PRACTICES, [
      { practice: "  QUOTES the line verbatim ", passed: true, evidence: "q" },
      { practice: "flags the fs import", passed: false, evidence: "f" },
      { practice: "names core-no-node-io", passed: true, evidence: "n" },
    ]);
    expect(v.results.map((r) => [r.practice, r.passed])).toEqual([
      [PRACTICES[0], false],
      [PRACTICES[1], true],
      [PRACTICES[2], true],
    ]);
  });

  it("falls back to position when the judge paraphrased practices but returned one per practice", () => {
    const v = alignVerdict(PRACTICES, [
      { practice: "1. fs import flagged", passed: true, evidence: "a" },
      { practice: "2. rule named", passed: true, evidence: "b" },
      { practice: "3. verbatim quote", passed: false, evidence: "c" },
    ]);
    expect(v.results.map((r) => [r.practice, r.passed, r.evidence])).toEqual([
      [PRACTICES[0], true, "a"],
      [PRACTICES[1], true, "b"],
      [PRACTICES[2], false, "c"],
    ]);
    expect(v.score).toBeCloseTo(2 / 3);
  });

  it("ignores extra results that match no practice and cannot raise the score", () => {
    const v = alignVerdict(
      ["only practice"],
      [
        { practice: "only practice", passed: false, evidence: "" },
        { practice: "invented practice", passed: true, evidence: "x" },
      ],
    );
    expect(v.total).toBe(1);
    expect(v.passed).toBe(0);
  });

  it("does not let one result satisfy the same practice twice", () => {
    const v = alignVerdict(["same", "same"], [{ practice: "same", passed: true, evidence: "x" }]);
    expect(v.passed).toBe(1);
    expect(v.total).toBe(2);
  });

  it("an empty practice list scores 0 instead of dividing by zero", () => {
    const v = alignVerdict([], []);
    expect(v).toMatchObject({ passed: 0, total: 0, score: 0 });
  });
});
