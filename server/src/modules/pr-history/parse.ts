const MERGE_RE = /^Merge pull request #(\d+)\b/;
const SQUASH_RE = /\(#(\d+)\)\s*$/;
const SQUASH_SUFFIX_RE = /\s*\(#\d+\)\s*$/;

/** PR number from a merge/squash commit subject, else null. */
export function parsePrNumber(subject: string): number | null {
  const m = MERGE_RE.exec(subject) ?? SQUASH_RE.exec(subject);
  return m ? Number(m[1]) : null;
}

/** Subject without the trailing `(#N)` squash suffix. */
export function cleanTitle(subject: string): string {
  return subject.replace(SQUASH_SUFFIX_RE, '').trim();
}

/** First non-empty trimmed line of `body`, ellipsized at `max`; '' when none. */
export function firstLine(body: string | null | undefined, max: number): string {
  const line = (body ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, Math.max(0, max - 1))}…` : line;
}
