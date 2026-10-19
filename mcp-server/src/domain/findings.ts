import type {
  Finding,
  FindingOut,
  Hint,
  ResponseFormat,
  Review,
  ReviewResult,
  Severity,
  SeverityCounts,
} from './types';

export const MAX_FINDINGS_LIMIT = 50;
export const DEFAULT_FINDINGS_LIMIT = 20;

const SUMMARY_MAX = 400;
const RATIONALE_MAX = 600;
const SUGGESTION_MAX = 400;

/** Lower number = more severe. */
const RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function severityRank(severity: Severity): number {
  return RANK[severity];
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function countFindings(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else counts.suggestion += 1;
  }
  return counts;
}

/** Keeps findings at least as severe as `min`, sorted CRITICAL -> SUGGESTION, then file, then line. */
export function filterAndSort(findings: Finding[], min?: Severity): Finding[] {
  const kept = min ? findings.filter((f) => severityRank(f.severity) <= severityRank(min)) : [...findings];
  return kept.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.file.localeCompare(b.file) ||
      (a.start_line ?? 0) - (b.start_line ?? 0),
  );
}

export function formatLine(start: number | null, end: number | null): string | undefined {
  if (start === null) return undefined;
  return end !== null && end !== start ? `${start}-${end}` : `${start}`;
}

export function toFindingOut(f: Finding, format: ResponseFormat): FindingOut {
  const out: FindingOut = { severity: f.severity, title: f.title, file: f.file, category: f.category };
  const line = formatLine(f.start_line, f.end_line);
  if (line !== undefined) out.line = line;
  if (format === 'detailed') {
    out.rationale = truncate(f.rationale ?? '', RATIONALE_MAX);
    out.suggestion = f.suggestion === null ? null : truncate(f.suggestion, SUGGESTION_MAX);
  }
  return out;
}

export interface ShapeOptions {
  /** owner/name */
  repo: string;
  pr: number;
  limit: number;
  severity?: Severity;
  format: ResponseFormat;
}

/** A finished review -> concise/detailed ReviewResult (counts over ALL findings; cap + NARROW hint). */
export function shapeReview(review: Review, opts: ShapeOptions): ReviewResult {
  const matched = filterAndSort(review.findings, opts.severity);
  const shown = matched.slice(0, opts.limit);
  const truncated = matched.length > shown.length;
  const hint: Hint | undefined = truncated
    ? { code: 'NARROW', shown: shown.length, total: matched.length, max: MAX_FINDINGS_LIMIT }
    : undefined;

  const result: ReviewResult = {
    status: 'done',
    // Summary-less legacy rows may lack a run id; fall back to the review id so the field stays a string.
    run_id: review.run_id ?? review.id,
    repo: opts.repo,
    pr: opts.pr,
    agent: review.agent_name,
    verdict: review.verdict,
    score: review.score,
    summary: review.summary === null ? null : truncate(review.summary, SUMMARY_MAX),
    counts: countFindings(review.findings),
    findings: shown.map((f) => toFindingOut(f, opts.format)),
    truncated,
  };
  if (hint) result.hint = hint;
  return result;
}

/** Non-error "still running" result with the poll hint. */
export function runningResult(opts: {
  repo: string;
  pr: number;
  agent: string;
  run_id: string;
}): ReviewResult {
  return {
    status: 'running',
    run_id: opts.run_id,
    repo: opts.repo,
    pr: opts.pr,
    agent: opts.agent,
    hint: { code: 'NEXT_POLL', repo: opts.repo, pr: opts.pr, run_id: opts.run_id },
  };
}
