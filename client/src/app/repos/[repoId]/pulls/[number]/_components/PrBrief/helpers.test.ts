import { describe, it, expect } from "vitest";
import { formatRef, missingInputsList, parseRefForNav, severityRank, sha7 } from "./helpers";

describe("PrBrief helpers", () => {
  it("sha7 truncates to 7 chars", () => {
    expect(sha7("abcdef0123456")).toBe("abcdef0");
    expect(sha7("abc")).toBe("abc");
  });

  it("missingInputsList uses spec order regardless of input order", () => {
    const t = (k: string) => k.split(".").pop()!;
    expect(missingInputsList(["blast", "intent"], t)).toBe("intent, blast");
    expect(missingInputsList([], t)).toBe("");
  });

  it("formatRef renders path, line and range", () => {
    expect(formatRef("a.ts")).toBe("a.ts");
    expect(formatRef("a.ts", 3)).toBe("a.ts:3");
    expect(formatRef("a.ts", 3, 9)).toBe("a.ts:3-9");
    expect(formatRef("a.ts", 3, 3)).toBe("a.ts:3");
  });

  it("parseRefForNav parses a trailing :N or :N-M, else the whole string is the file", () => {
    expect(parseRefForNav("src/a.ts:12")).toEqual({ file: "src/a.ts", line: 12 });
    expect(parseRefForNav("src/a.ts:12-20")).toEqual({ file: "src/a.ts", line: 12 });
    expect(parseRefForNav("src/a.ts")).toEqual({ file: "src/a.ts" });
    expect(parseRefForNav("src/a.ts:0")).toEqual({ file: "src/a.ts:0" });
    expect(parseRefForNav("a:b.ts:7")).toEqual({ file: "a:b.ts", line: 7 });
  });

  it("severityRank orders high before low", () => {
    expect(severityRank.high).toBeLessThan(severityRank.medium);
    expect(severityRank.medium).toBeLessThan(severityRank.low);
  });
});
