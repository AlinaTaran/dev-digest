import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { BriefTruncatedInput, Intent, SmartDiffRole } from '@devdigest/shared';
import { BRIEF_SYSTEM } from './prompts.js';
import type { DiffFileFact } from './hunks.js';
import {
  CALLERS_MAX,
  CALLERS_MIN,
  CRONS_MAX,
  DESCRIPTION_CHARS,
  DESCRIPTION_MIN,
  DIFF_FILES_MAX,
  ENDPOINTS_MAX,
  HUNK_RANGES_PER_FILE,
  INTENT_CHARS,
  SPEC_DOCS_MAX,
  SPEC_DOC_CHARS,
  SPECS_TOTAL_CHARS,
  SYMBOLS_MAX,
  TITLE_CHARS,
  USER_BUDGET_CHARS,
  cutText,
} from './limits.js';

export interface BriefBlastInput {
  summary: string;
  changed_symbols: { name: string; kind: string; file: string }[];
  callers: { file: string; line: number; name: string; rank: number }[];
  endpoints: string[];
  crons: string[];
}

export interface BriefInputArgs {
  title: string;
  intent: Intent | null;
  blast: BriefBlastInput | null;
  diffFiles: DiffFileFact[];
  description: string | null;
  specs: { path: string; text: string }[];
}

export interface BriefInput {
  system: string;
  user: string;
  truncated: BriefTruncatedInput[];
  charsBySource: Record<string, number>;
  tokensEst: number;
}

/** Labels are interpolated into an attribute by wrapUntrusted, which does not escape them. */
function safeLabel(label: string): string {
  return label.replace(/["<>\r\n]/g, '_');
}

const ROLE_REMOVAL_ORDER: SmartDiffRole[] = ['boilerplate', 'wiring', 'core'];

interface State {
  specs: { path: string; text: string }[];
  descriptionCap: number;
  callersCap: number;
  /** Files (after the 200 cap) in prompt order. */
  files: DiffFileFact[];
  overflowFiles: number;
  removed: Set<string>;
}

function formatFile(f: DiffFileFact): string {
  const ranges = f.ranges
    .slice(0, HUNK_RANGES_PER_FILE)
    .map((r) => `${r.start},${r.len}`)
    .join(' ');
  return `${f.path} [${f.role}] +${f.additions}/-${f.deletions}${ranges ? ` hunks: ${ranges}` : ''}`;
}

function render(args: BriefInputArgs, s: State): { blocks: [string, string][] } {
  const blocks: [string, string][] = [];
  blocks.push(['pr-title', cutText(args.title, TITLE_CHARS)]);

  if (args.intent) {
    const lines = [cutText(args.intent.intent, INTENT_CHARS)];
    if (args.intent.in_scope.length) lines.push('In scope:', ...args.intent.in_scope.map((x) => `- ${x}`));
    if (args.intent.out_of_scope.length) lines.push('Out of scope:', ...args.intent.out_of_scope.map((x) => `- ${x}`));
    blocks.push(['pr-intent', cutText(lines.join('\n'), INTENT_CHARS)]);
  }

  if (args.blast) {
    const b = args.blast;
    const callers = [...b.callers].sort((x, y) => y.rank - x.rank).slice(0, s.callersCap);
    const lines = [
      b.summary,
      ...b.changed_symbols.slice(0, SYMBOLS_MAX).map((x) => `${x.name} (${x.kind}) — ${x.file}`),
      ...callers.map((c) => `${c.file}:${c.line} ${c.name}`),
      ...b.endpoints.slice(0, ENDPOINTS_MAX).map((e) => `endpoint ${e}`),
      ...b.crons.slice(0, CRONS_MAX).map((c) => `cron ${c}`),
    ];
    blocks.push(['blast-radius', lines.join('\n')]);
  }

  const kept = s.files.filter((f) => !s.removed.has(f.path));
  const more = s.overflowFiles + s.removed.size;
  const stats = kept.map(formatFile);
  if (more > 0) stats.push(`+${more} more files`);
  blocks.push(['diff-stats', stats.join('\n')]);

  if (args.description !== null) blocks.push(['pr-description', cutText(args.description, s.descriptionCap)]);
  for (const d of s.specs) blocks.push([`spec:${d.path}`, d.text]);
  return { blocks };
}

function emit(blocks: [string, string][]): { user: string; charsBySource: Record<string, number> } {
  const charsBySource: Record<string, number> = {};
  const parts = blocks.map(([label, body]) => {
    charsBySource[label] = body.length;
    return wrapUntrusted(safeLabel(label), body);
  });
  return { user: parts.join('\n\n'), charsBySource };
}

/** Builds the system + user prompt under the NFR-1 budget. Receives hunk ranges only, never patch text. */
export function buildBriefInput(args: BriefInputArgs): BriefInput {
  const truncated: BriefTruncatedInput[] = [];
  const mark = (v: BriefTruncatedInput): void => {
    if (!truncated.includes(v)) truncated.push(v);
  };

  // Per-source caps first.
  let specs = args.specs.slice(0, SPEC_DOCS_MAX);
  if (args.specs.length > SPEC_DOCS_MAX) mark('specs');
  let remaining = SPECS_TOTAL_CHARS;
  const cappedSpecs: { path: string; text: string }[] = [];
  for (const d of specs) {
    if (remaining <= 0) {
      mark('specs');
      continue;
    }
    const text = cutText(d.text, Math.min(SPEC_DOC_CHARS, remaining));
    if (text !== d.text) mark('specs');
    remaining -= text.length;
    cappedSpecs.push({ path: d.path, text });
  }
  specs = cappedSpecs;

  const descriptionCap = DESCRIPTION_CHARS;
  if (args.description !== null && args.description.length > DESCRIPTION_CHARS) mark('description');

  if (args.blast && args.blast.callers.length > CALLERS_MAX) mark('blast_callers');

  const files = args.diffFiles.slice(0, DIFF_FILES_MAX);
  if (args.diffFiles.length > DIFF_FILES_MAX) mark('diff_files');

  const state: State = {
    specs,
    descriptionCap,
    callersCap: CALLERS_MAX,
    files,
    overflowFiles: args.diffFiles.length - files.length,
    removed: new Set(),
  };

  // Files in removal order: boilerplate, wiring, core; smallest churn first within a role.
  const removalOrder = [...files].sort((a, b) => {
    const ra = ROLE_REMOVAL_ORDER.indexOf(a.role);
    const rb = ROLE_REMOVAL_ORDER.indexOf(b.role);
    return ra - rb || a.additions + a.deletions - (b.additions + b.deletions);
  });

  let out = emit(render(args, state).blocks);
  while (out.user.length > USER_BUDGET_CHARS) {
    if (state.specs.length > 0) {
      const last = state.specs[state.specs.length - 1]!;
      if (state.specs.length > 1 || last.text.length <= 1_000) state.specs.pop();
      else last.text = cutText(last.text, Math.floor(last.text.length / 2));
      mark('specs');
    } else if (state.descriptionCap > DESCRIPTION_MIN && args.description !== null && args.description.length > DESCRIPTION_MIN) {
      state.descriptionCap = DESCRIPTION_MIN;
      mark('description');
    } else if (args.blast && state.callersCap > CALLERS_MIN && args.blast.callers.length > CALLERS_MIN) {
      state.callersCap = Math.max(CALLERS_MIN, Math.floor(state.callersCap / 2));
      mark('blast_callers');
    } else if (state.removed.size < removalOrder.length) {
      state.removed.add(removalOrder[state.removed.size]!.path);
      mark('diff_files');
    } else {
      break;
    }
    out = emit(render(args, state).blocks);
  }

  return {
    system: BRIEF_SYSTEM,
    user: out.user,
    truncated,
    charsBySource: out.charsBySource,
    tokensEst: Math.ceil(out.user.length / 4),
  };
}
