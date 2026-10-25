import { describe, it, expect } from "vitest";
import { diffTargetParams, parseDiffTarget } from "./diff-target";

const roundTrip = (file: string, line?: number) => {
  const params = diffTargetParams(file, line);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null) sp.set(k, v);
  return new URLSearchParams(sp.toString());
};

describe("diff-target", () => {
  it("round-trips awkward paths through URLSearchParams", () => {
    const file = "src/a b/#x%20&y/файл.ts";
    const t = parseDiffTarget(roundTrip(file, 42), [file]);
    expect(t).toEqual({ file, line: 42, inDiff: true });
  });

  it("rejects invalid lines, case mismatch and missing file", () => {
    for (const bad of ["0", "-3", "abc", "1e3"]) {
      const sp = new URLSearchParams({ file: "a.ts", line: bad });
      expect(parseDiffTarget(sp, ["a.ts"])?.line).toBeNull();
    }
    expect(parseDiffTarget(new URLSearchParams({ file: "A.ts" }), ["a.ts"])?.inDiff).toBe(false);
    expect(parseDiffTarget(new URLSearchParams(), ["a.ts"])).toBeNull();
    expect(parseDiffTarget(new URLSearchParams({ file: "" }), ["a.ts"])).toBeNull();
  });
});
