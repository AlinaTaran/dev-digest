import { describe, it, expect } from "vitest";
import { expectationWarnings, parseDiffFiles } from "./diff-files";

const DIFF = "--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,3 @@\n x\n+y\n z\n--- a/b.ts\n+++ b/b.ts\n@@ -5 +5 @@\n-q\n+r";

describe("diff-files", () => {
  it("splits files with hunk ranges and counts", () => {
    const files = parseDiffFiles(DIFF);
    expect(files.map((f) => [f.path, f.additions, f.deletions])).toEqual([["a.ts", 1, 0], ["b.ts", 1, 1]]);
    expect(files[0]!.hunks).toEqual([{ start: 1, end: 3 }]);
    expect(files[0]!.patch!.startsWith("@@")).toBe(true);
    expect(parseDiffFiles("garbage")).toEqual([]);
  });

  it("flags files not in the diff and lines outside every hunk (EC-24, EC-5)", () => {
    const files = parseDiffFiles(DIFF);
    expect(
      expectationWarnings([{ file: "a.ts", start_line: 2 }, { file: "zzz.ts", start_line: 1 }, { file: "a.ts", start_line: 99 }], files),
    ).toEqual([
      { index: 1, kind: "file_not_in_diff" },
      { index: 2, kind: "outside_fragment" },
    ]);
  });
});
