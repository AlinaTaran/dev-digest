/* eval/line-diff.ts — small pure LCS line diff (D13), no dependency. */

export type DiffLineKind = "same" | "add" | "del";
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}
export type DiffBlock = { type: "lines"; lines: DiffLine[] } | { type: "collapsed"; count: number };

/** Line diff of `a` → `b` via longest-common-subsequence. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a === "" ? [] : a.split("\n");
  const y = b === "" ? [] : b.split("\n");
  const n = x.length;
  const m = y.length;
  // lcs[i][j] = LCS length of x[i..] and y[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: x[i++]! });
    } else {
      out.push({ kind: "add", text: y[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: x[i++]! });
  while (j < m) out.push({ kind: "add", text: y[j++]! });
  return out;
}

/** True when the diff has no added or removed line. */
export function isUnchanged(lines: DiffLine[]): boolean {
  return lines.every((l) => l.kind === "same");
}

/** Collapse runs of unchanged lines longer than `threshold` into one `collapsed` block. */
export function collapseUnchanged(lines: DiffLine[], threshold = 6): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.kind === "same") {
      let end = i;
      while (end < lines.length && lines[end]!.kind === "same") end++;
      const run = lines.slice(i, end);
      blocks.push(run.length > threshold ? { type: "collapsed", count: run.length } : { type: "lines", lines: run });
      i = end;
    } else {
      let end = i;
      while (end < lines.length && lines[end]!.kind !== "same") end++;
      blocks.push({ type: "lines", lines: lines.slice(i, end) });
      i = end;
    }
  }
  return blocks;
}
