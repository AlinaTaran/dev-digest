/**
 * Domain types: the minimal shapes DevDigest data is reduced to.
 * Adapters map lenient HTTP payloads into these; use cases return the *Result DTOs;
 * delivery renders DTOs to MCP `content` + `structuredContent`.
 * Never carry agent `system_prompt` or convention `evidence_snippet` — they are not modelled on purpose.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type ResponseFormat = 'concise' | 'detailed';
export type Verdict = 'request_changes' | 'approve' | 'comment';

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

export interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

export interface Pull {
  id: string;
  number: number;
  title: string | null;
  status: string | null;
}

/** One entry of `POST /pulls/:id/review` -> `runs`. */
export interface StartedRun {
  run_id: string;
  agent_id: string;
  agent_name: string | null;
}

export interface RunSummary {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  /** Free text on the API (running|done|failed|cancelled); `null` = unknown, keep polling. */
  status: string | null;
  error: string | null;
}

export interface Finding {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number | null;
  end_line: number | null;
  rationale: string | null;
  suggestion: string | null;
}

export interface Review {
  id: string;
  run_id: string | null;
  agent_id: string;
  agent_name: string;
  /** `summary` rows are ignored by get_findings; `review` rows carry findings. */
  kind: string;
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  findings: Finding[];
}

export interface Convention {
  id: string;
  rule: string;
  category: string;
  evidence_path: string;
  evidence_line_start: number | null;
  evidence_line_end: number | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Forward-leading hints. Domain emits a structured hint; delivery/messages.ts
// renders it to the final text (keeps wording and URLs out of the domain).
// ---------------------------------------------------------------------------

export type Hint =
  | { code: 'NEXT_POLL'; repo: string; pr: number; run_id: string }
  | { code: 'NARROW'; shown: number; total: number; max: number }
  | { code: 'NO_AGENTS' }
  | { code: 'NO_CONVENTIONS'; repo: string; pending: number }
  | { code: 'BLAST_STUB' };

// ---------------------------------------------------------------------------
// Use-case result DTOs
// ---------------------------------------------------------------------------

export interface AgentOut {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentsResult {
  agents: AgentOut[];
  count: number;
  hint?: Hint;
}

export interface FindingOut {
  severity: Severity;
  title: string;
  file: string;
  /** "start-end" or "start"; absent when the API gave no line. */
  line?: string;
  category: string;
  /** detailed only (<= 600 chars) */
  rationale?: string;
  /** detailed only (<= 400 chars) */
  suggestion?: string | null;
}

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export interface ReviewResult {
  status: 'done' | 'running';
  run_id: string;
  /** owner/name */
  repo: string;
  pr: number;
  agent: string;
  verdict?: Verdict | null;
  score?: number | null;
  /** <= 400 chars */
  summary?: string | null;
  /** Over ALL findings of the review, before severity/limit filtering. */
  counts?: SeverityCounts;
  findings?: FindingOut[];
  truncated?: boolean;
  hint?: Hint;
}

export interface ConventionOut {
  /** <= 300 chars */
  rule: string;
  category: string;
  /** "path:line" or "path" */
  evidence: string;
}

export interface ConventionsResult {
  repo: string;
  conventions: ConventionOut[];
  count: number;
  total_accepted: number;
  pending: number;
  truncated: boolean;
  hint?: Hint;
}

export interface BlastRadiusResult {
  status: 'not_implemented';
  repo: string;
  pr: number;
  hint: Hint;
}
