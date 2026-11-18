import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalSuiteRun } from './eval.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  agent_version: z.number().int(),
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalSuiteRun),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
  /** Runner bundle version; set only for the runner file (its `contents` is empty in previews). */
  version: z.string().nullish(),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** `owner/name` — same shape the connected-repo lookup expects. */
const CiRepo = z.string().regex(/^[\w.-]+\/[\w.-]+$/);

export const CiTriggerEvent = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTriggerEvent = z.infer<typeof CiTriggerEvent>;

export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** Request body for `POST /agents/:id/ci/preview`. */
export const CiPreviewInput = z.object({
  repo: CiRepo,
  triggers: z.array(CiTriggerEvent).min(1).default(['opened', 'synchronize']),
  post_as: CiPostAs.default('github_review'),
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

/** Response of `POST /agents/:id/ci/preview`. */
export const CiPreview = z.object({ files: z.array(CiFile) });
export type CiPreview = z.infer<typeof CiPreview>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: CiRepo,
  target: z.literal('gha').default('gha'),
  /** "open_pr" opens a PR with the files; "zip" returns an archive and touches no GitHub. */
  action: z.enum(['open_pr', 'zip']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTriggerEvent).min(1).default(['opened', 'synchronize']),
  /** Hand-edited workflow YAML that replaces the generated one. */
  workflow_override: z.string().max(100_000).optional(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running', 'skipped']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  repo: z.string().nullable(),
  agent_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  verdict: Verdict.nullable(),
  findings_count: z.number().int().nullable(),
  critical: z.number().int().nullable(),
  warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(),
  run_attempt: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/** An installation as shown on the agent's CI tab (with its latest runs). */
export const AgentCiInstallation = CiInstallation.extend({
  workflow_file: z.string(),
  runner_version: z.string(),
  pr_url: z.string().nullable(),
  recent_runs: z.array(CiRun),
});
export type AgentCiInstallation = z.infer<typeof AgentCiInstallation>;

/** Response of `GET /agents/:id/ci`. */
export const AgentCi = z.object({
  ci_fail_on: CiFailOn,
  installations: z.array(AgentCiInstallation),
});
export type AgentCi = z.infer<typeof AgentCi>;

/** Response of `GET /ci/runs`. */
export const CiRunsList = z.object({ items: z.array(CiRun) });
export type CiRunsList = z.infer<typeof CiRunsList>;

/** Response of `POST /ci/runs/refresh`. */
export const CiRefreshResult = z.object({
  ingested: z.number().int(),
  errors: z.array(z.object({ repo: z.string(), reason: z.string() })),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  schema_version: z.literal(1),
  status: z.enum(['succeeded', 'no_findings', 'failed', 'skipped']),
  reason: z.string().max(2000).nullable(),
  verdict: Verdict.nullable(),
  findings_count: z.number().int().min(0),
  critical: z.number().int().min(0).nullish(),
  warning: z.number().int().min(0).nullish(),
  suggestion: z.number().int().min(0).nullish(),
  blockers: z.number().int().min(0),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().min(0).nullish(),
  agent: z.string().max(200),
  model: z.string().max(200),
  runner_version: z.string().max(50),
  version: z.string().nullish(),
  pr_number: z.number().int().positive(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
