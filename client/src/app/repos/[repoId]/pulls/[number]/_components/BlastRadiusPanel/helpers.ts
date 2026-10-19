import { githubBlobUrl } from "@/lib/github-urls";

/** GitHub link for a caller line, or undefined (non-clickable) without a repo.
    Prefers the indexed SHA (its line numbers are exact), else the PR head. */
export function callerHref(
  repoFullName: string | null,
  indexedSha: string | null,
  headSha: string,
  file: string,
  line: number,
): string | undefined {
  return repoFullName ? githubBlobUrl(repoFullName, indexedSha ?? headSha, file, line) : undefined;
}

/** Keep the first item per key (the server doesn't promise uniqueness). */
export function dedupeBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = keyOf(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** All expanded for <=3 symbols, otherwise only the first (symbol names, deduped). */
export function initialExpanded(symbols: readonly string[]): Set<string> {
  return new Set(symbols.length <= 3 ? symbols : symbols.slice(0, 1));
}
