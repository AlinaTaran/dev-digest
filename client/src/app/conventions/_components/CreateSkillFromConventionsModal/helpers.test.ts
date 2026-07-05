import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildBodyMarkdown, estimateTokens, slugifyRule } from "./helpers";

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

describe("slugifyRule", () => {
  it("kebab-cases arbitrary rule text", () => {
    expect(slugifyRule("Always use async/await instead of .then() chains")).toBe(
      "always-use-async-await-instead-of-then-chains",
    );
  });

  it("falls back to a placeholder for text with no alphanumerics", () => {
    expect(slugifyRule("!!!")).toBe("rule");
  });
});

describe("buildBodyMarkdown", () => {
  it("emits an H1 title and a directive intro sentence with no candidates", () => {
    const md = buildBodyMarkdown("acme-conventions", []);
    expect(md).toBe(
      "# acme-conventions\n\n" +
        "House conventions for `acme`. Flag changes that violate any rule below and cite the offending `file:line`.",
    );
  });

  it("emits one ## <rule-slug> section per candidate, in order, with rule text, evidence line, and snippet", () => {
    const md = buildBodyMarkdown("acme-conventions", [
      candidate({ rule: "Use camelCase", evidence_path: "src/a.ts", evidence_line_start: 3, evidence_line_end: 3, evidence_snippet: "const fooBar = 1;" }),
    ]);
    expect(md).toBe(
      "# acme-conventions\n\n" +
        "House conventions for `acme`. Flag changes that violate any rule below and cite the offending `file:line`.\n\n" +
        "## use-camelcase\n" +
        "Use camelCase\n\n" +
        "Detected in `src/a.ts:3`:\n" +
        "```\nconst fooBar = 1;\n```",
    );
  });

  it("renders a line range when start and end differ", () => {
    const md = buildBodyMarkdown("acme-conventions", [
      candidate({ rule: "Rule A", evidence_path: "src/a.ts", evidence_line_start: 2, evidence_line_end: 5 }),
    ]);
    expect(md).toContain("Detected in `src/a.ts:2-5`:");
  });

  it("falls back to just the file path when there is no evidence line", () => {
    const md = buildBodyMarkdown("acme-conventions", [
      candidate({ rule: "Rule A", evidence_path: "src/a.ts", evidence_line_start: null, evidence_line_end: null }),
    ]);
    expect(md).toContain("Detected in `src/a.ts`:");
  });

  it("keeps candidates in the order given (not grouped/sorted)", () => {
    const md = buildBodyMarkdown("acme-conventions", [
      candidate({ rule: "Rule A" }),
      candidate({ rule: "Rule B" }),
    ]);
    const headingOrder = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headingOrder).toEqual(["rule-a", "rule-b"]);
  });
});

describe("estimateTokens", () => {
  it("estimates roughly one token per four characters", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(8))).toBe(2);
    expect(estimateTokens("a".repeat(10))).toBe(3); // rounds to nearest token
  });
});
