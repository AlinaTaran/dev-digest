/* eval/word-diff.ts — pure word-level LCS diff for the Compare modal's prompt diff (no dependency).
   Tokens are the whitespace-split words *including* the whitespace runs, so joining `text` of the
   non-"add" tokens reproduces `a` and of the non-"del" tokens reproduces `b`. */

export type WordDiffKind = "same" | "add" | "del";
export interface WordToken {
  kind: WordDiffKind;
  text: string;
}

const tokenize = (s: string): string[] => (s === "" ? [] : s.split(/(\s+)/).filter((t) => t !== ""));

/** Word diff of `a` → `b` via longest-common-subsequence. */
export function wordDiff(a: string, b: string): WordToken[] {
  const x = tokenize(a);
  const y = tokenize(b);
  const n = x.length;
  const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: WordToken[] = [];
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
  return coalesce(out);
}

/** Group each run of changes into one removed block followed by one added block, so a rewritten
    sentence reads "old words | new words" instead of interleaving word by word. Whitespace that
    sits between two changes is absorbed into both blocks (keeps the round-trip invariant). */
function coalesce(tokens: WordToken[]): WordToken[] {
  const out: WordToken[] = [];
  let dels: string[] = [];
  let adds: string[] = [];
  let gap: string[] = [];
  const flush = () => {
    if (dels.length) out.push({ kind: "del", text: dels.join("") });
    if (adds.length) out.push({ kind: "add", text: adds.join("") });
    dels = [];
    adds = [];
    if (gap.length) out.push({ kind: "same", text: gap.join("") });
    gap = [];
  };
  for (const t of tokens) {
    if (t.kind === "same") {
      if ((dels.length || adds.length) && /^\s+$/.test(t.text)) {
        gap.push(t.text);
        continue;
      }
      flush();
      out.push(t);
    } else {
      if (gap.length) {
        dels.push(...gap);
        adds.push(...gap);
        gap = [];
      }
      (t.kind === "del" ? dels : adds).push(t.text);
    }
  }
  flush();
  return out;
}

/** True when the diff has no added or removed token. */
export function isWordDiffUnchanged(tokens: WordToken[]): boolean {
  return tokens.every((t) => t.kind === "same");
}
