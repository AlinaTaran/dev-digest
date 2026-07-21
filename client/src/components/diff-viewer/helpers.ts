/** Pure helpers for the DiffViewer. */
import type { PrFile } from "@/lib/types";
import { HUNK_HEADER_RE, MECHANICAL_PATTERNS } from "./constants";

/** Collapse multiple `pr_files` rows for the same path into ONE file entry.
 *  A PR's file list is NOT guaranteed unique per path — an import can yield
 *  several diff fragments for one file (seen on PR #2, which carries two
 *  `CLAUDE.md` rows). The viewer keys each card by `path`, so duplicates would
 *  collide as React keys and crash the render. A file's diff belongs in one
 *  card anyway, so we sum the +/- stats and concatenate the non-empty patch
 *  fragments (each is a run of `@@` hunks, so joining stays parseable),
 *  preserving first-seen order. */
export function dedupeFilesByPath(files: PrFile[]): PrFile[] {
  const byPath = new Map<string, PrFile>();
  for (const f of files) {
    const existing = byPath.get(f.path);
    if (!existing) {
      byPath.set(f.path, { ...f });
      continue;
    }
    existing.additions += f.additions;
    existing.deletions += f.deletions;
    const patches = [existing.patch, f.patch].filter(Boolean) as string[];
    existing.patch = patches.length > 0 ? patches.join("\n") : null;
  }
  return [...byPath.values()];
}

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Stable React key for a parsed line — unique within a file, so refetching the
 *  diff reuses the right CodeLine instance instead of leaking hover/compose state
 *  across rows (which array-index keys would do). */
export function lineKey(ln: Line): string {
  switch (ln.kind) {
    case "add":
      return `a:${ln.newNo}`;
    case "del":
      return `d:${ln.oldNo}`;
    case "ctx":
      return `c:${ln.oldNo}:${ln.newNo}`;
    case "hunk":
      return `h:${ln.text}`;
  }
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

/** Stable DOM id for a rendered line — the scroll target for a "N findings"
 *  badge click. Not a valid CSS selector char-for-char (paths contain `/`), so
 *  callers must use `document.getElementById`, never a `querySelector`. */
export function anchorId(path: string, lineNo: number): string {
  return `diff-line:${path}:${lineNo}`;
}

/** Lock files, `package.json`, generated output, and snapshots — files whose
 *  diff is noise to a human reviewer. Used to collapse the real patch behind a
 *  "Mechanical changes" placeholder unless the file actually has findings. */
export function isMechanical(path: string): boolean {
  return MECHANICAL_PATTERNS.some((re) => re.test(path));
}
