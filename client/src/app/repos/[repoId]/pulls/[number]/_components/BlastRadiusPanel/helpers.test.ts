import { describe, it, expect } from "vitest";
import { callerHref, dedupeBy, initialExpanded } from "./helpers";

describe("callerHref", () => {
  it("prefers the indexed sha, falls back to head sha, and is undefined without a repo", () => {
    expect(callerHref("o/r", "idx", "head", "src/a.ts", 7)).toBe("https://github.com/o/r/blob/idx/src/a.ts#L7");
    expect(callerHref("o/r", null, "head", "src/a.ts", 7)).toBe("https://github.com/o/r/blob/head/src/a.ts#L7");
    expect(callerHref(null, "idx", "head", "src/a.ts", 7)).toBeUndefined();
  });
});

describe("dedupeBy / initialExpanded", () => {
  it("keeps the first per key; expands all for <=3 symbols else only the first", () => {
    expect(dedupeBy([{ k: "a", v: 1 }, { k: "a", v: 2 }, { k: "b", v: 3 }], (x) => x.k)).toEqual([
      { k: "a", v: 1 },
      { k: "b", v: 3 },
    ]);
    expect([...initialExpanded(["a", "b", "c"])]).toEqual(["a", "b", "c"]);
    expect([...initialExpanded(["a", "b", "c", "d"])]).toEqual(["a"]);
  });
});
