/**
 * Code-side verification of a raw LLM-proposed convention candidate against
 * the actual sampled file contents (the "samples" from `service.ts`'s
 * `gatherSamples`: config files + `repoIntel.getConventionSampleFiles`).
 *
 * A candidate is kept only when ALL of:
 *  - `evidence_path` exactly matches one of the sampled files' paths.
 *  - if `evidence_line_start` is given, it's a valid line number in that
 *    file (1 <= start <= totalLines, and end >= start / end <= totalLines
 *    when `evidence_line_end` is also given).
 *  - `evidence_snippet` (trimmed) is found verbatim within the file, in the
 *    line range `start..end` with a few lines of slack on each side (to
 *    tolerate off-by-one line numbers from the model) — or anywhere in the
 *    file when no line numbers were given.
 *
 * Failing candidates are dropped silently — never surfaced as an error to
 * the caller. This is what lets `pending` rows be trusted without a human
 * reviewing every proposal.
 */

export interface SampleFile {
  path: string;
  content: string;
}

export interface RawConventionCandidate {
  evidence_path: string;
  evidence_line_start?: number;
  evidence_line_end?: number;
  evidence_snippet: string;
}

/** Lines of slack on each side of the given line range, to tolerate off-by-one line numbers. */
const LINE_SLACK = 3;

export function verifyCandidate(candidate: RawConventionCandidate, samples: SampleFile[]): boolean {
  const sample = samples.find((s) => s.path === candidate.evidence_path);
  if (!sample) return false;

  const snippet = candidate.evidence_snippet.trim();
  if (!snippet) return false;

  const lines = sample.content.split(/\r?\n/);
  const totalLines = lines.length;

  if (candidate.evidence_line_start == null) {
    return sample.content.includes(snippet);
  }

  const start = candidate.evidence_line_start;
  if (start < 1 || start > totalLines) return false;

  const end = candidate.evidence_line_end ?? start;
  if (candidate.evidence_line_end != null && (end < start || end > totalLines)) return false;

  const regionStart = Math.max(1, start - LINE_SLACK);
  const regionEnd = Math.min(totalLines, end + LINE_SLACK);
  const region = lines.slice(regionStart - 1, regionEnd).join('\n');
  return region.includes(snippet);
}
