import { describe, it, expect } from "vitest";
import { wordDiff, isWordDiffUnchanged } from "./word-diff";

const join = (ts: { kind: string; text: string }[], skip: string) =>
  ts.filter((t) => t.kind !== skip).map((t) => t.text).join("");

describe("wordDiff", () => {
  it("marks only the changed words and round-trips both sides", () => {
    const a = "Return at most 5 findings.\nFlag secrets.";
    const b = "Return at most 5 findings.\nFlag unused imports as suggestions.";
    const d = wordDiff(a, b);
    expect(join(d, "add")).toBe(a);
    expect(join(d, "del")).toBe(b);
    expect(d.filter((t) => t.kind === "del").map((t) => t.text)).toContain("secrets.");
    expect(d.filter((t) => t.kind === "add").map((t) => t.text)).toContain("imports");
    expect(d[0]).toEqual({ kind: "same", text: "Return" });
  });

  it("handles identical and empty inputs", () => {
    expect(isWordDiffUnchanged(wordDiff("a b", "a b"))).toBe(true);
    expect(wordDiff("", "")).toEqual([]);
    expect(wordDiff("", "x y").every((t) => t.kind === "add")).toBe(true);
    expect(wordDiff("x y", "").every((t) => t.kind === "del")).toBe(true);
  });
});
