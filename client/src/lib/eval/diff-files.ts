/* eval/diff-files.ts — split a case's unified diff into per-file patches (for the DiffViewer
   preview and the Files tab) and expose each file's new-side hunk ranges (for the EC-5 warning).
   Pure and tolerant: garbage input yields no files; the server is the authority on validity. */
import type { PrFile } from "@devdigest/shared";

export interface HunkRange {
  start: number;
  end: number;
}
export interface DiffFile extends PrFile {
  hunks: HunkRange[];
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const stripPrefix = (p: string): string => p.replace(/^[ab]\//, "");

export function parseDiffFiles(diff: string): DiffFile[] {
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  const patch: string[] = [];
  const flush = () => {
    if (cur) cur.patch = patch.join("\n");
    patch.length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) {
      flush();
      const path = stripPrefix(lines[i + 1]!.slice(4).trim());
      cur = { path, additions: 0, deletions: 0, patch: "", hunks: [] };
      files.push(cur);
      i++;
      continue;
    }
    if (!cur) continue;
    const m = HUNK_RE.exec(line);
    if (m) {
      const start = Number(m[1]);
      const len = m[2] === undefined ? 1 : Number(m[2]);
      cur.hunks.push({ start, end: start + Math.max(len, 1) - 1 });
    } else if (line.startsWith("+")) cur.additions++;
    else if (line.startsWith("-")) cur.deletions++;
    if (cur.hunks.length > 0) patch.push(line);
  }
  flush();
  return files.filter((f) => f.hunks.length > 0);
}

export type ExpectationWarning = { index: number; kind: "file_not_in_diff" | "outside_fragment" };

/** Non-blocking warnings for already-valid expectations (EC-24, EC-5). */
export function expectationWarnings(
  expectations: { file: string; start_line: number }[],
  files: DiffFile[],
): ExpectationWarning[] {
  const out: ExpectationWarning[] = [];
  expectations.forEach((e, index) => {
    const f = files.find((x) => x.path === e.file);
    if (!f) out.push({ index, kind: "file_not_in_diff" });
    else if (!f.hunks.some((h) => e.start_line >= h.start && e.start_line <= h.end)) {
      out.push({ index, kind: "outside_fragment" });
    }
  });
  return out;
}
