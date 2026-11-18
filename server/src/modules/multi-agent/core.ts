/**
 * Pure multi-agent logic (no DB / Fastify / container): finding grouping,
 * conflict detection, status derivation and estimate means. Everything the
 * results page shows about "where agents agree / disagree" is computed here on
 * read from persisted findings — nothing is stored.
 */
import type {
  AgentColumn,
  Conflict,
  FindingGroup,
  MultiAgentRunStatus,
} from '@devdigest/shared';
import { normalizePath, normalizeRange, rangesOverlap, type NormalizedRange } from '../eval/core/matching.js';

type Severity = FindingGroup['severity'];
type ColumnFinding = AgentColumn['findings'][number];

const SEVERITY_RANK: Record<Severity, number> = { SUGGESTION: 0, WARNING: 1, CRITICAL: 2 };

interface Member {
  finding: ColumnFinding;
  runId: string;
  agentId: string | null;
}

interface Draft {
  file: string;
  range: NormalizedRange;
  members: Member[];
}

const doneOnly = (columns: AgentColumn[]): AgentColumn[] => columns.filter((c) => c.status === 'done');

/**
 * Group overlapping findings of different agents (AC-48, AC-50, AC-51).
 * Only `done` columns take part. Findings are visited in a fixed order (file,
 * start line, column order) so the result is independent of input shuffling
 * within a column. A finding joins the first group whose FIRST member shares
 * its file and overlaps its range, provided the group has no finding from the
 * same run yet; otherwise it opens a new group.
 */
export function groupFindings(columns: AgentColumn[]): FindingGroup[] {
  const done = doneOnly(columns);
  const items: { m: Member; order: number; path: string; range: NormalizedRange }[] = [];
  done.forEach((col, order) => {
    for (const f of col.findings) {
      items.push({
        m: { finding: f, runId: col.run_id, agentId: col.agent_id },
        order,
        path: normalizePath(f.file),
        range: normalizeRange(f.start_line, f.end_line),
      });
    }
  });
  items.sort(
    (a, b) =>
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      a.range.start - b.range.start ||
      a.order - b.order ||
      (a.m.finding.id < b.m.finding.id ? -1 : a.m.finding.id > b.m.finding.id ? 1 : 0),
  );

  const drafts: Draft[] = [];
  for (const it of items) {
    const target = drafts.find(
      (d) => d.file === it.path && rangesOverlap(d.range, it.range) && !d.members.some((x) => x.runId === it.m.runId),
    );
    if (target) target.members.push(it.m);
    else drafts.push({ file: it.path, range: it.range, members: [it.m] });
  }

  return drafts.map((d) => {
    const first = d.members[0]!.finding;
    const severity = d.members.reduce<Severity>(
      (best, x) => (SEVERITY_RANK[x.finding.severity] > SEVERITY_RANK[best] ? x.finding.severity : best),
      first.severity,
    );
    const group: FindingGroup = {
      file: d.file,
      start_line: d.range.start,
      end_line: d.range.end,
      title: first.title,
      severity,
      finding_ids: d.members.map((x) => x.finding.id),
      agent_ids: d.members.map((x) => x.agentId),
      is_conflict: false,
    };
    group.is_conflict = isConflict(d.members.map((x) => ({ runId: x.runId, severity: x.finding.severity })), done.length);
    return group;
  });
}

/** AC-54: flagged by fewer than all done runs, or members' severities differ. */
export function isConflict(members: { runId: string; severity: Severity }[], doneRunCount: number): boolean {
  const runs = new Set(members.map((m) => m.runId));
  if (runs.size < doneRunCount) return true;
  return new Set(members.map((m) => m.severity)).size > 1;
}

/** One `Conflict` per conflicting group, with one take per done column. */
export function buildConflicts(groups: FindingGroup[], columns: AgentColumn[]): Conflict[] {
  const done = doneOnly(columns);
  const byId = new Map<string, ColumnFinding>();
  const runOfFinding = new Map<string, string>();
  for (const col of done) {
    for (const f of col.findings) {
      byId.set(f.id, f);
      runOfFinding.set(f.id, col.run_id);
    }
  }
  return groups
    .filter((g) => g.is_conflict)
    .map((g) => {
      const memberByRun = new Map<string, ColumnFinding>();
      for (const id of g.finding_ids) {
        const f = byId.get(id);
        const run = runOfFinding.get(id);
        if (f && run) memberByRun.set(run, f);
      }
      return {
        file: g.file,
        line: g.start_line,
        title: g.title,
        takes: done.map((col) => {
          const f = memberByRun.get(col.run_id);
          return f
            ? { agent_id: col.agent_id, persona: col.agent_name, verdict: f.severity, note: f.title }
            : { agent_id: col.agent_id, persona: col.agent_name, verdict: 'not_flagged' as const, note: null };
        }),
      };
    });
}

/** AC-75: running if any child runs, failed if none is done, else done. */
export function deriveStatus(childStatuses: (string | null)[]): MultiAgentRunStatus {
  if (childStatuses.some((s) => s === 'running')) return 'running';
  if (!childStatuses.some((s) => s === 'done')) return 'failed';
  return 'done';
}

/** AC-17/18: mean duration + cost over the given done runs; nulls when empty. */
export function meanEstimate(runs: { durationMs: number | null; costUsd: number | null }[]): {
  mean_duration_ms: number | null;
  mean_cost_usd: number | null;
  sample_size: number;
} {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    mean_duration_ms: mean(runs.flatMap((r) => (r.durationMs == null ? [] : [r.durationMs]))),
    mean_cost_usd: mean(runs.flatMap((r) => (r.costUsd == null ? [] : [r.costUsd]))),
    sample_size: runs.length,
  };
}
