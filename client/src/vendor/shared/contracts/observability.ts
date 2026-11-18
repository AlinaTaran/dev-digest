import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  /** Null when the agent was deleted after the run. */
  agent_id: z.string().nullable(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  /** Failure reason for failed/cancelled runs; null otherwise (or when none recorded). */
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(FindingRecord),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string().nullable(),
  /** The agent's name. */
  persona: z.string(),
  /** Severity if the agent flagged it, or 'not_flagged' when it did not. */
  verdict: z.union([Severity, z.literal('not_flagged')]),
  note: z.string().nullable(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** A group of overlapping findings from different agents (computed on read). */
export const FindingGroup = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  /** Highest severity among the members. */
  severity: Severity,
  finding_ids: z.array(z.string()),
  agent_ids: z.array(z.string().nullable()),
  is_conflict: z.boolean(),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

export const MultiAgentRunStatus = z.enum(['running', 'done', 'failed']);
export type MultiAgentRunStatus = z.infer<typeof MultiAgentRunStatus>;

/** Request body of POST /pulls/:id/multi-agent-run. */
export const MultiAgentRunRequest = z.object({
  agent_ids: z.array(z.string().uuid()).min(1).max(50),
});
export type MultiAgentRunRequest = z.infer<typeof MultiAgentRunRequest>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  status: MultiAgentRunStatus,
  agent_count: z.number().int(),
  /** Longest child duration (the runs execute in parallel). */
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  groups: z.array(FindingGroup),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** One row of GET /repos/:id/multi-agent-runs (the "Recent runs" landing). */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  status: MultiAgentRunStatus,
  agent_count: z.number().int(),
  ran_at: z.string(),
  /** Longest child duration (the runs execute in parallel); 0 when none finished. */
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

/** Mean of an agent's last (up to 5) done runs; GET /agents/estimates. */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  mean_duration_ms: z.number().nullable(),
  mean_cost_usd: z.number().nullable(),
  sample_size: z.number().int().min(0).max(5),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
