import {
  OnboardingNodeKind,
  type Onboarding,
  type OnboardingDiagramEdge,
  type OnboardingDiagramNode,
  type OnboardingSectionEmptyReason,
} from '@devdigest/shared';
import { groundRunStep, type CommandContext } from './commands.js';
import type { OnboardingDraft } from './draft-schema.js';
import { ONBOARDING_LIMITS as L, cutText } from './limits.js';
import { normalizeRepoPath, type PathIndex } from './paths.js';

export interface GroundContext {
  /** Index file list: grounds architecture, critical paths and reading path. */
  indexed: PathIndex;
  /** Tracked tree at `source_sha`: grounds first-task paths; `null` when unavailable. */
  tracked: PathIndex | null;
  /** Real fan-in per path; the model's numbers are never used (AC-30). */
  fanIn: Map<string, number>;
  commands: CommandContext;
}

export type SectionKind = Onboarding['sections'][number]['kind'];

export interface GroundResult {
  sections: Onboarding['sections'];
  /** Every ungrounded/invalid reference the model produced and we removed. */
  droppedRefs: number;
  /** Surviving items per section (architecture: summary + nodes). */
  counts: Record<SectionKind, number>;
}

const PATHLIKE_TOKEN = /\.[A-Za-z0-9]{1,8}$/;
const INLINE_CODE = /`([^`\n]+)`/g;

function emptyReason(supplied: number, kept: number): OnboardingSectionEmptyReason | null {
  if (kept > 0) return null;
  return supplied > 0 ? 'all_dropped' : 'no_data';
}

/** Unwrap inline-code path tokens that are not in the index (AC-19); grounded ones keep backticks (AC-22). */
function groundSummary(
  summary: string | null,
  ctx: GroundContext,
  drop: () => void,
): string | null {
  if (summary === null) return null;
  const grounded = summary.replace(INLINE_CODE, (whole, token: string) => {
    const looksLikePath = token.includes('/') || PATHLIKE_TOKEN.test(token);
    if (!looksLikePath || ctx.indexed.matchesRef(token)) return whole;
    drop();
    return token;
  });
  if (grounded.trim().length === 0) return null;
  return grounded.length > L.summaryChars ? null : grounded;
}

function groundDiagram(
  diagram: OnboardingDraft['architecture']['diagram'],
  ctx: GroundContext,
  drop: () => void,
): { nodes: OnboardingDiagramNode[]; edges: OnboardingDiagramEdge[] } | null {
  if (diagram === null) return null;
  const nodes: OnboardingDiagramNode[] = [];
  const ids = new Set<string>();
  for (const n of diagram.nodes) {
    if (nodes.length >= L.nodesMax) break;
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    const kind = OnboardingNodeKind.safeParse(n.kind.trim().toLowerCase());
    let path: string | null = null;
    if (n.path !== null) {
      const norm = normalizeRepoPath(n.path);
      if (norm !== null && ctx.indexed.matchesRef(norm)) path = norm;
      else drop();
    }
    nodes.push({
      id: n.id,
      label: cutText(n.label, L.nodeLabel),
      kind: kind.success ? kind.data : 'module',
      path,
    });
  }
  if (nodes.length < L.nodesMin) return null;
  const edges: OnboardingDiagramEdge[] = [];
  for (const e of diagram.edges) {
    if (edges.length >= L.edgesMax) break;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    // `ids` also holds ids of nodes cut by the cap? No: ids is only added before the cap break, so it is exact.
    edges.push({ from: e.from, to: e.to, label: e.label === null ? null : cutText(e.label, L.edgeLabel) });
  }
  return { nodes, edges };
}

/** Ground a path against a file index, deduplicating; counts invalid refs. */
function groundFiles<T extends { path: string }>(
  items: readonly T[],
  ctx: GroundContext,
  max: number,
  drop: () => void,
): Array<{ item: T; path: string }> {
  const out: Array<{ item: T; path: string }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const path = normalizeRepoPath(item.path);
    if (path === null || !ctx.indexed.hasFile(path)) {
      drop();
      continue;
    }
    if (seen.has(path) || out.length >= max) continue;
    seen.add(path);
    out.push({ item, path });
  }
  return out;
}

function classifyTask(
  rawPath: string,
  tracked: PathIndex,
): { path: string; path_kind: 'file' | 'dir' | 'new_file' } | null {
  const norm = normalizeRepoPath(rawPath);
  if (norm === null) return null;
  const kind = tracked.classify(norm);
  if (kind === 'file') return { path: norm, path_kind: 'file' };
  if (kind === 'dir') {
    const withSlash = `${norm}/`;
    return withSlash.length > L.pathChars ? null : { path: withSlash, path_kind: 'dir' };
  }
  const slash = norm.lastIndexOf('/');
  if (slash === -1 || tracked.hasDir(norm.slice(0, slash))) {
    return { path: norm, path_kind: 'new_file' };
  }
  return null;
}

/**
 * Turn the lenient LLM draft into contract-valid sections. Every path/command is
 * checked against code-side facts; caps are applied here, in model order (Decision 3).
 */
export function groundDraft(draft: OnboardingDraft, ctx: GroundContext): GroundResult {
  let droppedRefs = 0;
  const drop = (): void => {
    droppedRefs += 1;
  };

  // Architecture
  const summary = groundSummary(draft.architecture.summary_md, ctx, drop);
  const diagram = groundDiagram(draft.architecture.diagram, ctx, drop);
  const archSupplied =
    (draft.architecture.summary_md?.trim() ? 1 : 0) + (draft.architecture.diagram?.nodes.length ?? 0);
  const archKept = (summary === null ? 0 : 1) + (diagram?.nodes.length ?? 0);

  // Critical paths
  const critical = groundFiles(draft.critical_paths, ctx, L.criticalMax, drop).map(({ item, path }) => ({
    path,
    why: item.why === null ? null : cutText(item.why, L.whyChars),
    fan_in: ctx.fanIn.get(path) ?? 0,
  }));

  // Run locally
  const steps: Onboarding['sections'][2]['steps'] = [];
  for (const s of draft.run_locally) {
    const grounded = groundRunStep(s, ctx.commands);
    if (grounded === null) {
      drop();
      continue;
    }
    if (steps.length < L.stepsMax) steps.push(grounded);
  }

  // Reading path
  const reading = groundFiles(draft.reading_path, ctx, L.readingMax, drop).map(({ item, path }) => ({
    path,
    why: cutText(item.why, L.whyChars),
  }));

  // First tasks
  const tasks: Onboarding['sections'][4]['tasks'] = [];
  if (ctx.tracked !== null) {
    for (const t of draft.first_tasks) {
      const complexity = t.complexity.trim().toLowerCase();
      if (complexity !== 'low' && complexity !== 'medium') continue; // AC-70
      const placed = classifyTask(t.path, ctx.tracked);
      if (placed === null) {
        drop();
        continue;
      }
      if (tasks.length < L.tasksMax) {
        tasks.push({ title: cutText(t.title, L.taskTitle), ...placed, complexity });
      }
    }
  }
  const tasksReason: OnboardingSectionEmptyReason | null =
    ctx.tracked === null
      ? 'no_data'
      : emptyReason(draft.first_tasks.length, tasks.length);

  const sections: Onboarding['sections'] = [
    {
      kind: 'architecture',
      empty_reason: emptyReason(archSupplied, archKept),
      summary_md: summary,
      top_dirs: [],
      diagram,
    },
    {
      kind: 'critical_paths',
      empty_reason: emptyReason(draft.critical_paths.length, critical.length),
      items: critical,
    },
    {
      kind: 'run_locally',
      empty_reason: emptyReason(draft.run_locally.length, steps.length),
      steps,
    },
    {
      kind: 'reading_path',
      empty_reason: emptyReason(draft.reading_path.length, reading.length),
      steps: reading,
    },
    { kind: 'first_tasks', empty_reason: tasksReason, tasks },
  ];

  return {
    sections,
    droppedRefs,
    counts: {
      architecture: archKept,
      critical_paths: critical.length,
      run_locally: steps.length,
      reading_path: reading.length,
      first_tasks: tasks.length,
    },
  };
}
