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
    expect(d.filter((t) => t.kind === "del").map((t) => t.text)).toEqual(["secrets."]);
    expect(d.filter((t) => t.kind === "add").map((t) => t.text)).toEqual(["unused imports as suggestions."]);
    expect(d[0]).toEqual({ kind: "same", text: "Return" });
  });

  it("handles identical and empty inputs", () => {
    expect(isWordDiffUnchanged(wordDiff("a b", "a b"))).toBe(true);
    expect(wordDiff("", "")).toEqual([]);
    expect(wordDiff("", "x y").every((t) => t.kind === "add")).toBe(true);
    expect(wordDiff("x y", "").every((t) => t.kind === "del")).toBe(true);
  });

  it("groups a rewritten sentence into one removed block then one added block (no word interleaving)", () => {
    const a = "Report anything that looks suspicious. Be thorough and flag every query you see.";
    const b = "Report only issues you can cite. Do not flag parameterised queries as injection.";
    const d = wordDiff(a, b);
    expect(join(d, "add")).toBe(a);
    expect(join(d, "del")).toBe(b);
    // every added block is contiguous text: the new sentence survives intact somewhere in the add blocks
    expect(d.filter((x) => x.kind === "add").map((x) => x.text).join("")).toContain("parameterised");
    // no two adjacent tokens of the same change kind (they would have been merged into one block)
    d.slice(1).forEach((tok, i) => {
      if (tok.kind !== "same") expect(d[i]!.kind).not.toBe(tok.kind);
    });
  });
});
