export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** Minimal line-based diff (classic LCS backtrace) — good enough for skill
    bodies (tens of lines), avoids pulling in a diff dependency. */
export function diffLines(a: string, b: string): DiffOp[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const n = linesA.length;
  const m = linesB.length;

  // lcs[i][j] = length of the LCS of linesA[i..] and linesB[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const rowI = lcs[i]!;
    const rowI1 = lcs[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      rowI[j] = linesA[i] === linesB[j] ? rowI1[j + 1]! + 1 : Math.max(rowI1[j]!, rowI[j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const la = linesA[i]!;
    const lb = linesB[j]!;
    if (la === lb) {
      ops.push({ type: "same", text: la });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: "del", text: la });
      i++;
    } else {
      ops.push({ type: "add", text: lb });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", text: linesA[i]! });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", text: linesB[j]! });
    j++;
  }
  return ops;
}
