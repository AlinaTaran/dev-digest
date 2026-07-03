import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildBodyMarkdown, estimateTokens } from "./helpers";

function candidate(over: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c0",
    rule: "Rule",
    category: "naming",
    evidence_path: "src/file.ts",
    evidence_line_start: 1,
    evidence_line_end: 1,
    evidence_snippet: "const x = 1;",
    confidence: 0.9,
    status: "accepted",
    ...over,
  };
}

describe("buildBodyMarkdown", () => {
  it("returns an empty string for no candidates", () => {
    expect(buildBodyMarkdown([])).toBe("");
  });

  it("emits a single ## heading with one bullet per candidate in that category", () => {
    const md = buildBodyMarkdown([
      candidate({ rule: "Use camelCase", category: "naming", evidence_path: "src/a.ts", evidence_line_start: 3 }),
      candidate({ rule: "No default exports", category: "naming", evidence_path: "src/b.ts", evidence_line_start: 7 }),
    ]);
    expect(md).toBe(
      "## naming\n" +
        "- Use camelCase — Detected in `src/a.ts:3`\n" +
        "- No default exports — Detected in `src/b.ts:7`",
    );
  });

  it("groups candidates by category and orders sections by first-seen category order", () => {
    const md = buildBodyMarkdown([
      candidate({ rule: "Rule A", category: "error-handling", evidence_path: "src/a.ts", evidence_line_start: 1 }),
      candidate({ rule: "Rule B", category: "naming", evidence_path: "src/b.ts", evidence_line_start: 2 }),
      candidate({ rule: "Rule C", category: "error-handling", evidence_path: "src/c.ts", evidence_line_start: 3 }),
    ]);
    const sections = md.split("\n\n");
    expect(sections).toHaveLength(2);
    // error-handling appears first because its first candidate (Rule A) came first.
    expect(sections[0]).toBe(
      "## error-handling\n" +
        "- Rule A — Detected in `src/a.ts:1`\n" +
        "- Rule C — Detected in `src/c.ts:3`",
    );
    expect(sections[1]).toBe("## naming\n- Rule B — Detected in `src/b.ts:2`");
  });

  it("falls back to a `?` line marker when a candidate has no evidence line", () => {
    const md = buildBodyMarkdown([
      candidate({ rule: "Rule A", category: "naming", evidence_path: "src/a.ts", evidence_line_start: null }),
    ]);
    expect(md).toBe("## naming\n- Rule A — Detected in `src/a.ts:?`");
  });
});

describe("estimateTokens", () => {
  it("estimates roughly one token per four characters", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(8))).toBe(2);
    expect(estimateTokens("a".repeat(10))).toBe(3); // rounds to nearest token
  });
});
