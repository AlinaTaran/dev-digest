import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff, review focus and meta. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief: limits, enums, risks, focus, meta ----
export const BRIEF_LIMITS = {
  summaryChars: 600,
  risksMax: 6,
  risksModelMax: 10,
  riskTitleChars: 80,
  riskExplanationChars: 300,
  riskKindChars: 30,
  refsMax: 3,
  focusMax: 8,
  focusModelMax: 12,
  focusReasonChars: 160,
} as const;

export const BriefMissingInput = z.enum(['intent', 'blast', 'specs', 'description']);
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

export const BriefTruncatedInput = z.enum(['specs', 'description', 'blast_callers', 'diff_files']);
export type BriefTruncatedInput = z.infer<typeof BriefTruncatedInput>;

/**
 * Mirrors `BlastDegradedReason` in blast-api.ts; parity is asserted in
 * server/test/contracts.test.ts; cannot import it (blast-api imports this file).
 */
export const BriefBlastReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BriefBlastReason = z.infer<typeof BriefBlastReason>;

export const BriefRisk = Risk.extend({
  kind: z.string().max(BRIEF_LIMITS.riskKindChars),
  title: z.string().min(1).max(BRIEF_LIMITS.riskTitleChars),
  explanation: z.string().max(BRIEF_LIMITS.riskExplanationChars),
  file_refs: z.array(z.string().min(1)).min(1).max(BRIEF_LIMITS.refsMax),
});
export type BriefRisk = z.infer<typeof BriefRisk>;

export const BriefRisks = z.object({
  risks: z.array(BriefRisk).max(BRIEF_LIMITS.risksMax),
});
export type BriefRisks = z.infer<typeof BriefRisks>;

export const ReviewFocusItem = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  reason: z.string().min(1).max(BRIEF_LIMITS.focusReasonChars),
  line_adjusted: z.boolean(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const PrBriefMeta = z.object({
  head_sha: z.string().min(1),
  generated_at: z.string(),
  model: z.object({ provider: z.string(), model: z.string() }),
  missing_inputs: z.array(BriefMissingInput),
  blast_reason: BriefBlastReason.nullable(),
  input_truncated: z.array(BriefTruncatedInput),
  input_tokens_est: z.number().int().nonnegative(),
  specs_used: z.array(z.string()),
  specs_skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost_usd: z.number().nullable(),
  dropped_refs: z.number().int().nonnegative(),
  adjusted_lines: z.number().int().nonnegative(),
});
export type PrBriefMeta = z.infer<typeof PrBriefMeta>;

// ---- Model output schemas ----
/** Model-side risk: no `.max` on file_refs (refs are capped after grounding). */
export const BriefModelRisk = Risk.extend({
  kind: z.string().max(BRIEF_LIMITS.riskKindChars),
  title: z.string().min(1).max(BRIEF_LIMITS.riskTitleChars),
  explanation: z.string().max(BRIEF_LIMITS.riskExplanationChars),
  file_refs: z.array(z.string()).min(1),
});

/** Default strict-mode schema. The model never sets `line_adjusted` or `meta`. */
export const BriefModelOutput = z.object({
  summary: z.string().min(1).max(BRIEF_LIMITS.summaryChars),
  risks: z.array(BriefModelRisk).max(BRIEF_LIMITS.risksModelMax),
  review_focus: z
    .array(
      z.object({
        file: z.string(),
        line: z.number().int().min(1),
        reason: z.string().min(1).max(BRIEF_LIMITS.focusReasonChars),
      }),
    )
    .max(BRIEF_LIMITS.focusModelMax),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

/**
 * Fallback schema, used only when the provider rejects string-length keywords
 * in strict mode; string caps are applied in code before `PrBrief.parse`.
 */
export const BriefModelOutputCountsOnly = z.object({
  summary: z.string(),
  risks: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        explanation: z.string(),
        severity: RiskSeverity,
        file_refs: z.array(z.string()).min(1),
      }),
    )
    .max(BRIEF_LIMITS.risksModelMax),
  review_focus: z
    .array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() }))
    .max(BRIEF_LIMITS.focusModelMax),
});
/** Shared draft shape; both model schemas' outputs are assignable to it. */
export type BriefModelDraft = z.infer<typeof BriefModelOutputCountsOnly>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  summary: z.string().min(1).max(BRIEF_LIMITS.summaryChars),
  risks: BriefRisks,
  review_focus: z.array(ReviewFocusItem).max(BRIEF_LIMITS.focusMax),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  history: PrHistory.nullable(),
  meta: PrBriefMeta,
});
export type PrBrief = z.infer<typeof PrBrief>;

export const PrBriefResponse = z.object({
  pr_id: z.string().uuid(),
  brief: PrBrief.nullable(),
  generating: z.boolean(),
  stale: z.boolean(),
  current_head_sha: z.string(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
