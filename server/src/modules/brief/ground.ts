import { BRIEF_LIMITS, type BriefModelDraft, type BriefRisk, type ReviewFocusItem } from '@devdigest/shared';
import { cutText } from './limits.js';
import { inRanges, nearestInRanges, rangesOverlap, type LineRange } from './hunks.js';
import { normalizeModelPath, parseRef } from './paths.js';

export interface GroundDiffEntry {
  ranges: LineRange[];
  hasLines: boolean;
}
export interface GroundBlastEntry {
  callerLines: number[];
}
export interface GroundContext {
  /** ALL diff files (not only those that fit in the prompt). */
  diff: Map<string, GroundDiffEntry>;
  /** null when the blast block was absent from the prompt. */
  blast: Map<string, GroundBlastEntry> | null;
}
export interface GroundedBrief {
  risks: BriefRisk[];
  review_focus: ReviewFocusItem[];
  dropped_refs: number;
  adjusted_lines: number;
}

/** Cuts model strings to the contract caps (no-op on an already valid draft). */
export function capModelStrings(draft: BriefModelDraft): BriefModelDraft {
  return {
    summary: cutText(draft.summary, BRIEF_LIMITS.summaryChars),
    risks: draft.risks.map((r) => ({
      ...r,
      kind: cutText(r.kind, BRIEF_LIMITS.riskKindChars),
      title: cutText(r.title, BRIEF_LIMITS.riskTitleChars),
      explanation: cutText(r.explanation, BRIEF_LIMITS.riskExplanationChars),
    })),
    review_focus: draft.review_focus.map((f) => ({
      ...f,
      reason: cutText(f.reason, BRIEF_LIMITS.focusReasonChars),
    })),
  };
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function formatRef(path: string, start: number, end: number | undefined): string {
  return end !== undefined && end !== start ? `${path}:${start}-${end}` : `${path}:${start}`;
}

function nearestOf(line: number, lines: number[]): number | null {
  return nearestInRanges(
    line,
    lines.map((l) => ({ start: l, len: 1 })),
  );
}

/** Drops/repairs model refs and focus items against what the diff and blast facts support. */
export function groundBrief(output: BriefModelDraft, ctx: GroundContext): GroundedBrief {
  let dropped = 0;
  let adjusted = 0;

  const groundRef = (raw: string): string | null => {
    const { path, start, end } = parseRef(normalizeModelPath(raw));
    const d = ctx.diff.get(path);
    if (d) {
      if (d.hasLines && start !== undefined && rangesOverlap(start, end ?? start, d.ranges)) {
        return formatRef(path, start, end);
      }
      return path;
    }
    const b = ctx.blast?.get(path);
    if (b) {
      if (start !== undefined && b.callerLines.some((l) => l >= start && l <= (end ?? start))) {
        return formatRef(path, start, end);
      }
      return path;
    }
    return null;
  };

  const risks: BriefRisk[] = [];
  for (const r of output.risks) {
    const refs: string[] = [];
    for (const raw of r.file_refs) {
      const ref = groundRef(raw);
      if (ref === null) dropped++;
      else if (!refs.includes(ref)) refs.push(ref);
    }
    if (refs.length === 0) continue;
    risks.push({ ...r, file_refs: refs.slice(0, BRIEF_LIMITS.refsMax) });
  }
  risks.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const focus: ReviewFocusItem[] = [];
  const seen = new Set<string>();
  for (const f of output.review_focus) {
    const file = normalizeModelPath(f.file);
    if (f.line < 1) {
      dropped++;
      continue;
    }
    let line = f.line;
    let lineAdjusted = false;
    const d = ctx.diff.get(file);
    const b = d ? undefined : ctx.blast?.get(file);
    if (d) {
      if (!d.hasLines) continue;
      if (!inRanges(line, d.ranges)) {
        const near = nearestInRanges(line, d.ranges);
        if (near === null) continue;
        line = near;
        lineAdjusted = true;
      }
    } else if (b) {
      if (!b.callerLines.includes(line)) {
        const near = nearestOf(line, b.callerLines);
        if (near === null) continue;
        line = near;
        lineAdjusted = true;
      }
    } else {
      dropped++;
      continue;
    }
    const key = `${file}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (lineAdjusted) adjusted++;
    focus.push({ file, line, reason: f.reason, line_adjusted: lineAdjusted });
  }

  return {
    risks: risks.slice(0, BRIEF_LIMITS.risksMax),
    review_focus: focus.slice(0, BRIEF_LIMITS.focusMax),
    dropped_refs: dropped,
    adjusted_lines: adjusted,
  };
}
