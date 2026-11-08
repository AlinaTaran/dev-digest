import { z } from 'zod';
import { Severity, FindingCategory, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind } from './knowledge.js';

/**
 * Eval pipeline contracts (L06). Wire fields are snake_case.
 *
 * This file is vendored BYTE-IDENTICALLY in `server/src/vendor/shared` and
 * `client/src/vendor/shared` (asserted by `server/test/eval-contract-sync.test.ts`).
 * It EXTENDS `knowledge.ts` (`EvalCase`, `EvalRun`, `EvalOwnerKind`); it never edits it.
 */

// ===========================================================================
// Limits
// ===========================================================================

export const EVAL_MAX_DIFF_BYTES = 262_144;
export const EVAL_MAX_EXPECTATIONS = 50;
export const EVAL_MAX_CASES_PER_RUN = 50;
export const EVAL_CASE_NAME_MAX = 120;
export const EVAL_PR_BODY_MAX = 4000;
export const EVAL_CASE_TIMEOUT_MS = 90_000;
export const EVAL_RUN_CONCURRENCY = 3;
/** Metric drop (fraction) that raises the dashboard alert: 2 points. */
export const EVAL_ALERT_DROP = 0.02;

// ===========================================================================
// Case: expectations, meta, files
// ===========================================================================

export const EvalExpectation = z
  .object({
    expect: z.enum(['must_find', 'must_not_flag']),
    file: z.string().min(1).max(500),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1).optional(),
    severity: Severity.optional(),
    category: FindingCategory.optional(),
    title: z.string().max(200).optional(),
  })
  .strict();
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalExpectations = z.array(EvalExpectation).max(EVAL_MAX_EXPECTATIONS);
export type EvalExpectations = z.infer<typeof EvalExpectations>;

export const EvalSourceDecision = z.enum(['accepted', 'dismissed']);
export type EvalSourceDecision = z.infer<typeof EvalSourceDecision>;

export const EvalCaseSource = z.object({
  finding_id: z.string(),
  review_id: z.string(),
  agent_id: z.string().nullable(),
  decision: EvalSourceDecision,
});
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

export const EvalCaseMeta = z.object({
  repo: z.string(),
  pr_number: z.number().int(),
  title: z.string().max(300),
  body: z.string().max(EVAL_PR_BODY_MAX),
  head_sha: z.string(),
  source: EvalCaseSource.nullable(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalInputFile = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
});
export type EvalInputFile = z.infer<typeof EvalInputFile>;

// ===========================================================================
// Case result
// ===========================================================================

export const EvalCaseErrorReason = z.enum(['llm_failed', 'invalid_output', 'timeout', 'interrupted']);
export type EvalCaseErrorReason = z.infer<typeof EvalCaseErrorReason>;

export const EvalCaseError = z.object({
  reason: EvalCaseErrorReason,
  message: z.string(),
});
export type EvalCaseError = z.infer<typeof EvalCaseError>;

export const EvalCaseActualOutput = z.object({
  kept: z.array(Finding),
  dropped: z.array(z.object({ finding: Finding, reason: z.string() })),
  expectations: z.array(
    z.object({
      index: z.number().int(),
      matched: z.boolean(),
      matched_finding_ids: z.array(z.string()),
    }),
  ),
  finding_verdicts: z.array(
    z.object({
      finding_id: z.string(),
      verdict: z.enum(['tp', 'fp']),
      hit_must_not_flag: z.boolean(),
    }),
  ),
});
export type EvalCaseActualOutput = z.infer<typeof EvalCaseActualOutput>;

/** API view of one `eval_runs` row (one case executed once). */
export const EvalCaseResult = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string(),
  /** `null` for single-case runs (outside run history). */
  suite_run_id: z.string().nullable(),
  ran_at: z.string(),
  pass: z.boolean(),
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  expected_count: z.number().int(),
  got_count: z.number().int(),
  error: EvalCaseError.nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  actual_output: EvalCaseActualOutput,
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

/** Response view of a case; narrows `EvalCase` from `knowledge.ts`. */
export const EvalCaseView = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.array(EvalInputFile),
  input_meta: EvalCaseMeta,
  expected_output: z.array(EvalExpectation),
  notes: z.string().nullable(),
  source_finding_id: z.string().nullable(),
  created_at: z.string(),
  last_result: EvalCaseResult.nullable(),
});
export type EvalCaseView = z.infer<typeof EvalCaseView>;

// ===========================================================================
// Suite run ("eval run")
// ===========================================================================

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalConfigSnapshot = z.object({
  provider: z.string(),
  model: z.string(),
  system_prompt: z.string(),
  strategy: z.string(),
  skills: z.array(z.object({ id: z.string(), name: z.string(), version: z.number().int() })),
  agent_name: z.string(),
  /** Set only for skill runs; `skills` then holds only the tested skill. */
  skill_body: z.string().nullable(),
  skill_id: z.string().nullish(),
  skill_version: z.number().int().nullish(),
  skill_name: z.string().nullish(),
});
export type EvalConfigSnapshot = z.infer<typeof EvalConfigSnapshot>;

export const EvalSuiteRun = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  /** The `vN` label: `agents.version` or `skills.version`. */
  owner_version: z.number().int(),
  /** The agent that ran the cases: the owner agent, or the host agent for a skill run. */
  agent_id: z.string().nullable(),
  agent_version: z.number().int(),
  status: EvalSuiteRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_errored: z.number().int(),
  metrics: EvalRun.nullable(),
  config_snapshot: EvalConfigSnapshot,
  case_ids: z.array(z.string()),
  error_reason: z.string().nullable(),
  host_agent_name: z.string().nullish(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

// ===========================================================================
// Request bodies / query
// ===========================================================================

export const CreateEvalCaseBody = z.object({
  name: z.string().min(1).max(EVAL_CASE_NAME_MAX),
  input_diff: z.string(),
  input_meta: EvalCaseMeta.pick({ title: true, body: true }).partial().optional(),
  expected_output: EvalExpectations,
  notes: z.string().nullish(),
});
export type CreateEvalCaseBody = z.infer<typeof CreateEvalCaseBody>;

export const UpdateEvalCaseBody = CreateEvalCaseBody.partial();
export type UpdateEvalCaseBody = z.infer<typeof UpdateEvalCaseBody>;

export const FindingEvalCaseBody = z
  .object({ owner_kind: EvalOwnerKind, owner_id: z.string().uuid() })
  .optional();
export type FindingEvalCaseBody = z.infer<typeof FindingEvalCaseBody>;

export const RunEvalCaseBody = z.object({ host_agent_id: z.string().uuid() }).optional();
export type RunEvalCaseBody = z.infer<typeof RunEvalCaseBody>;

export const StartSkillEvalRunBody = z.object({ host_agent_id: z.string().uuid() });
export type StartSkillEvalRunBody = z.infer<typeof StartSkillEvalRunBody>;

export const RunAllEvalBody = z.object({ all: z.literal(true) });
export type RunAllEvalBody = z.infer<typeof RunAllEvalBody>;

export const EvalDaysQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((n) => n === 7 || n === 30 || n === 90, { message: 'days must be 7, 30 or 90' })
    .default(30),
});
export type EvalDaysQuery = z.infer<typeof EvalDaysQuery>;

// ===========================================================================
// Responses
// ===========================================================================

export const FindingEvalCaseResponse = z.object({
  case: EvalCaseView,
  created: z.boolean(),
  owner_name: z.string(),
});
export type FindingEvalCaseResponse = z.infer<typeof FindingEvalCaseResponse>;

export const StartEvalRunResponse = z.object({ eval_run: EvalSuiteRun });
export type StartEvalRunResponse = z.infer<typeof StartEvalRunResponse>;

export const EvalRunDetail = z.object({
  eval_run: EvalSuiteRun,
  results: z.array(EvalCaseResult),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

export const EvalRunAllSkipReason = z.enum([
  'disabled',
  'no_cases',
  'too_many_cases',
  'in_progress',
  'llm_not_configured',
]);
export type EvalRunAllSkipReason = z.infer<typeof EvalRunAllSkipReason>;

export const RunAllEvalResponse = z.object({
  started: z.array(EvalSuiteRun),
  skipped: z.array(z.object({ agent_id: z.string(), reason: EvalRunAllSkipReason })),
});
export type RunAllEvalResponse = z.infer<typeof RunAllEvalResponse>;

/** `GET /eval/dashboard` — agents only; skill runs are kept off the dashboard. */
export const EvalOverview = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      name: z.string(),
      model: z.string(),
      cases_total: z.number().int(),
      last_run: EvalSuiteRun.nullable(),
      recall_sparkline: z.array(z.number()),
    }),
  ),
  recent_runs: z.array(EvalSuiteRun.extend({ agent_name: z.string() })),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

/** `GET /findings/:id/eval-targets` — powers the "turn into eval case" target menu. */
export const EvalTargets = z.object({
  agent: z.object({ id: z.string(), name: z.string() }).nullable(),
  skills: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type EvalTargets = z.infer<typeof EvalTargets>;

// ===========================================================================
// 409 error-detail enums
// ===========================================================================

export const EvalCaseUnavailableReason = z.enum([
  'undecided',
  'no_diff',
  'too_large',
  'agent_missing',
  'skill_not_linked',
]);
export type EvalCaseUnavailableReason = z.infer<typeof EvalCaseUnavailableReason>;

export const EvalRunUnavailableReason = z.enum([
  'no_cases',
  'too_many_cases',
  'no_host_agent',
  'llm_not_configured',
]);
export type EvalRunUnavailableReason = z.infer<typeof EvalRunUnavailableReason>;
