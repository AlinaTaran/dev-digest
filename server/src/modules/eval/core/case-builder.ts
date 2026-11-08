import {
  EVAL_MAX_DIFF_BYTES,
  EVAL_PR_BODY_MAX,
  type EvalCaseMeta,
  type EvalExpectation,
  type EvalInputFile,
  type EvalOwnerKind,
  type EvalSourceDecision,
  type Finding,
  type UnifiedDiff,
} from '@devdigest/shared';
import { diffByteLength, inputFilesFrom } from './diff-input.js';
import { normalizePath } from './matching.js';

const SLUG_MAX = 60;
const TITLE_MAX = 300;

/** AC-8: lower-case latin letters, digits, hyphens; <= 60; fallback `case`. */
export function slugifyCaseName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug === '' ? 'case' : slug;
}

/** AC-8: `base`, then `base-2`, `base-3`, ... until unused. */
export function uniqueCaseName(base: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

interface Section {
  path: string;
  /** Lines from the first `@@` on (empty when the section has no hunk). */
  hunkLines: string[];
}

function splitSections(raw: string): Section[] {
  const sections: Section[] = [];
  let header: string | null = null;
  let plusPath: string | null = null;
  let hunkLines: string[] = [];
  let inHunk = false;

  const flush = () => {
    if (header === null) return;
    const m = header.match(/^diff --git a\/.+? b\/(.+)$/);
    const path = plusPath ?? m?.[1] ?? '';
    if (path) sections.push({ path, hunkLines });
  };

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      flush();
      header = line;
      plusPath = null;
      hunkLines = [];
      inHunk = false;
      continue;
    }
    if (header === null) continue;
    if (!inHunk && line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      if (p !== '/dev/null') plusPath = p;
      continue;
    }
    if (!inHunk && line.startsWith('@@')) inHunk = true;
    if (inHunk) hunkLines.push(line);
  }
  flush();
  return sections;
}

/**
 * D19: exact-path slice of `diff.raw` (NOT substring: `b/a.ts` must not capture `b/a.tsx`).
 * Merges duplicate sections of the same path (EC-6) and normalises headers to
 * `--- a/<path>` / `+++ b/<path>`. `null` when the path has no hunk (AC-11).
 */
export function extractFileFragment(diff: UnifiedDiff, path: string): string | null {
  const target = normalizePath(path);
  const hunks = splitSections(diff.raw)
    .filter((s) => s.path === target && s.hunkLines.length > 0)
    .flatMap((s) => {
      const lines = [...s.hunkLines];
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines;
    });
  if (hunks.length === 0) return null;
  return [`diff --git a/${target} b/${target}`, `--- a/${target}`, `+++ b/${target}`, ...hunks].join('\n') + '\n';
}

function truncateUnits(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1); // no lone high surrogate
  return out;
}

export type CaseFromFindingFinding = Pick<
  Finding,
  'id' | 'severity' | 'category' | 'title' | 'file' | 'start_line' | 'end_line'
>;

export interface BuildCaseFromFindingInput {
  finding: CaseFromFindingFinding;
  decision: EvalSourceDecision;
  review: { id: string; agent_id: string | null };
  pull: { number: number; title: string; body: string | null; head_sha: string };
  repoFullName: string;
  /** From `extractFileFragment`; `null` means the file has no patch. */
  fragment: string | null;
  /** The fragment parsed (service layer owns parsing, core stays adapter-free). */
  parsedFragment: UnifiedDiff;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  existingNames: Iterable<string>;
}

export interface BuiltEvalCase {
  name: string;
  owner_kind: EvalOwnerKind;
  owner_id: string;
  input_diff: string;
  input_files: EvalInputFile[];
  input_meta: EvalCaseMeta;
  expected_output: EvalExpectation[];
  notes: null;
  source_finding_id: string;
  warnings: 'finding_line_outside_fragment'[];
}

export type BuildCaseResult =
  | { ok: true; value: BuiltEvalCase }
  | { ok: false; reason: 'no_diff' | 'too_large' };

/** AC-3, AC-4, AC-6, AC-8, EC-5, EC-7, AC-11. */
export function buildCaseFromFinding(input: BuildCaseFromFindingInput): BuildCaseResult {
  const { finding, fragment, parsedFragment } = input;
  if (fragment === null || fragment.trim() === '') return { ok: false, reason: 'no_diff' };
  if (diffByteLength(fragment) > EVAL_MAX_DIFF_BYTES) return { ok: false, reason: 'too_large' };

  const hasNewSide = parsedFragment.files.some((f) => f.hunks.some((h) => h.newLines > 0));
  if (!hasNewSide) return { ok: false, reason: 'no_diff' };

  const target = normalizePath(finding.file);
  const covered = parsedFragment.files.some(
    (f) =>
      normalizePath(f.path) === target &&
      f.hunks.some((h) => h.newLineNumbers.includes(finding.start_line)),
  );

  return {
    ok: true,
    value: {
      name: uniqueCaseName(slugifyCaseName(finding.title), input.existingNames),
      owner_kind: input.ownerKind,
      owner_id: input.ownerId,
      input_diff: fragment,
      input_files: inputFilesFrom(parsedFragment),
      input_meta: {
        repo: input.repoFullName,
        pr_number: input.pull.number,
        title: truncateUnits(input.pull.title, TITLE_MAX),
        body: truncateUnits(input.pull.body ?? '', EVAL_PR_BODY_MAX),
        head_sha: input.pull.head_sha,
        source: {
          finding_id: finding.id,
          review_id: input.review.id,
          agent_id: input.review.agent_id,
          decision: input.decision,
        },
      },
      expected_output: [
        {
          expect: input.decision === 'accepted' ? 'must_find' : 'must_not_flag',
          file: finding.file,
          start_line: finding.start_line,
          end_line: finding.end_line,
          severity: finding.severity,
          category: finding.category,
          title: finding.title,
        },
      ],
      notes: null,
      source_finding_id: finding.id,
      warnings: covered ? [] : ['finding_line_outside_fragment'],
    },
  };
}
