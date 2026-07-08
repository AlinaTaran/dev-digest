import { describe, it, expect } from "vitest";
import { dedupeFilesByPath } from "./helpers";
import type { PrFile } from "@/lib/types";

describe("dedupeFilesByPath", () => {
  it("merges multiple rows for the same path into one entry (PR #2 CLAUDE.md case)", () => {
    const files: PrFile[] = [
      { path: "CLAUDE.md", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+added line" },
      { path: "src/a.ts", additions: 5, deletions: 2, patch: "@@ -1,2 +1,5 @@\n code" },
      { path: "CLAUDE.md", additions: 0, deletions: 61, patch: "@@ -1,61 +0,0 @@\n-removed line" },
    ];
    const out = dedupeFilesByPath(files);

    expect(out).toHaveLength(2);
    const claude = out.find((f) => f.path === "CLAUDE.md")!;
    expect(claude.additions).toBe(1); // 1 + 0
    expect(claude.deletions).toBe(61); // 0 + 61
    // Both hunk fragments survive in one card.
    expect(claude.patch).toContain("+added line");
    expect(claude.patch).toContain("-removed line");
    // No duplicate paths remain → safe as React keys.
    expect(new Set(out.map((f) => f.path)).size).toBe(out.length);
  });

  it("preserves first-seen order and leaves unique paths untouched", () => {
    const files: PrFile[] = [
      { path: "b.ts", additions: 1, deletions: 0, patch: null },
      { path: "a.ts", additions: 2, deletions: 0, patch: null },
    ];
    expect(dedupeFilesByPath(files).map((f) => f.path)).toEqual(["b.ts", "a.ts"]);
  });

  it("keeps patch null when every fragment for a path is empty", () => {
    const files: PrFile[] = [
      { path: "x", additions: 0, deletions: 1, patch: null },
      { path: "x", additions: 0, deletions: 2, patch: null },
    ];
    const [x] = dedupeFilesByPath(files);
    expect(x!.patch).toBeNull();
    expect(x!.deletions).toBe(3);
  });
});
