import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const ONBOARDING_SECTION_KINDS = [
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
] as const;

/** Caps applied in code after grounding; the LLM draft schema carries none of them. */
export const ONBOARDING_LIMITS = {
  summaryChars: 1200,
  nodesMax: 12,
  nodesMin: 2,
  edgesMax: 20,
  nodeLabel: 40,
  edgeLabel: 30,
  criticalMax: 8,
  whyChars: 120,
  stepsMax: 10,
  commandChars: 300,
  noteChars: 120,
  readingMax: 10,
  tasksMax: 3,
  taskTitle: 80,
  pathChars: 512,
} as const;

export const OnboardingSectionEmptyReason = z.enum(['all_dropped', 'needs_llm', 'no_data']);
export type OnboardingSectionEmptyReason = z.infer<typeof OnboardingSectionEmptyReason>;

export const OnboardingNodeKind = z.enum([
  'client',
  'entrypoint',
  'module',
  'middleware',
  'datastore',
  'external',
]);
export type OnboardingNodeKind = z.infer<typeof OnboardingNodeKind>;

export const OnboardingDegradedReason = z.enum([
  'index_partial',
  'no_import_graph',
  'llm_unavailable',
  'llm_failed',
]);
export type OnboardingDegradedReason = z.infer<typeof OnboardingDegradedReason>;

export const OnboardingErrorReason = z.enum([
  'timeout',
  'interrupted',
  'llm_failed',
  'llm_unavailable',
  'internal',
]);
export type OnboardingErrorReason = z.infer<typeof OnboardingErrorReason>;

export const OnboardingDiagramNode = z.object({
  id: z.string(),
  label: z.string().max(ONBOARDING_LIMITS.nodeLabel),
  kind: OnboardingNodeKind,
  path: z.string().nullable(),
});
export type OnboardingDiagramNode = z.infer<typeof OnboardingDiagramNode>;

export const OnboardingDiagramEdge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().max(ONBOARDING_LIMITS.edgeLabel).nullable(),
});
export type OnboardingDiagramEdge = z.infer<typeof OnboardingDiagramEdge>;

export const OnboardingArchitectureSection = z.object({
  kind: z.literal('architecture'),
  empty_reason: OnboardingSectionEmptyReason.nullable(),
  summary_md: z.string().max(ONBOARDING_LIMITS.summaryChars).nullable(),
  top_dirs: z.array(z.object({ path: z.string(), files: z.number().int() })),
  diagram: z
    .object({
      nodes: z
        .array(OnboardingDiagramNode)
        .min(ONBOARDING_LIMITS.nodesMin)
        .max(ONBOARDING_LIMITS.nodesMax),
      edges: z.array(OnboardingDiagramEdge).max(ONBOARDING_LIMITS.edgesMax),
    })
    .nullable(),
});
export type OnboardingArchitectureSection = z.infer<typeof OnboardingArchitectureSection>;

export const OnboardingCriticalPathsSection = z.object({
  kind: z.literal('critical_paths'),
  empty_reason: OnboardingSectionEmptyReason.nullable(),
  items: z
    .array(
      z.object({
        path: z.string(),
        why: z.string().max(ONBOARDING_LIMITS.whyChars).nullable(),
        fan_in: z.number().int().min(0),
      }),
    )
    .max(ONBOARDING_LIMITS.criticalMax),
});
export type OnboardingCriticalPathsSection = z.infer<typeof OnboardingCriticalPathsSection>;

export const OnboardingRunLocallySection = z.object({
  kind: z.literal('run_locally'),
  empty_reason: OnboardingSectionEmptyReason.nullable(),
  steps: z
    .array(
      z.object({
        command: z.string().max(ONBOARDING_LIMITS.commandChars),
        source_path: z.string(),
        note: z.string().max(ONBOARDING_LIMITS.noteChars).nullable(),
      }),
    )
    .max(ONBOARDING_LIMITS.stepsMax),
});
export type OnboardingRunLocallySection = z.infer<typeof OnboardingRunLocallySection>;

export const OnboardingReadingPathSection = z.object({
  kind: z.literal('reading_path'),
  empty_reason: OnboardingSectionEmptyReason.nullable(),
  steps: z
    .array(z.object({ path: z.string(), why: z.string().max(ONBOARDING_LIMITS.whyChars) }))
    .max(ONBOARDING_LIMITS.readingMax),
});
export type OnboardingReadingPathSection = z.infer<typeof OnboardingReadingPathSection>;

export const OnboardingFirstTasksSection = z.object({
  kind: z.literal('first_tasks'),
  empty_reason: OnboardingSectionEmptyReason.nullable(),
  tasks: z
    .array(
      z.object({
        title: z.string().max(ONBOARDING_LIMITS.taskTitle),
        path: z.string().max(ONBOARDING_LIMITS.pathChars),
        path_kind: z.enum(['file', 'dir', 'new_file']),
        complexity: z.enum(['low', 'medium']),
      }),
    )
    .max(ONBOARDING_LIMITS.tasksMax),
});
export type OnboardingFirstTasksSection = z.infer<typeof OnboardingFirstTasksSection>;

export const OnboardingSection = z.discriminatedUnion('kind', [
  OnboardingArchitectureSection,
  OnboardingCriticalPathsSection,
  OnboardingRunLocallySection,
  OnboardingReadingPathSection,
  OnboardingFirstTasksSection,
]);
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  generated_at: z.string(), // ISO
  source_sha: z.string(),
  files_indexed: z.number().int(),
  index_status: z.enum(['full', 'partial']),
  degraded: z.boolean(),
  reasons: z.array(OnboardingDegradedReason),
  model: z.object({ provider: z.string(), model: z.string() }).nullable(),
  dropped_refs: z.number().int().min(0),
  // Exactly five sections, in page order.
  sections: z.tuple([
    OnboardingArchitectureSection,
    OnboardingCriticalPathsSection,
    OnboardingRunLocallySection,
    OnboardingReadingPathSection,
    OnboardingFirstTasksSection,
  ]),
});
export type Onboarding = z.infer<typeof Onboarding>;

export const OnboardingGeneration = z.object({
  id: z.string(),
  status: z.enum(['generating', 'done', 'failed']),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  error_reason: OnboardingErrorReason.nullable(),
});
export type OnboardingGeneration = z.infer<typeof OnboardingGeneration>;

export const OnboardingAvailability = z.object({
  can_generate: z.boolean(),
  reason: z.enum(['not_cloned', 'no_index']).nullable(),
});
export type OnboardingAvailability = z.infer<typeof OnboardingAvailability>;

export const OnboardingTourResponse = z.object({
  repo_id: z.string(),
  tour: Onboarding.nullable(),
  generation: OnboardingGeneration.nullable(),
  availability: OnboardingAvailability,
  stale: z.boolean(),
  current_index_sha: z.string().nullable(),
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;

export const OnboardingGenerateResponse = z.object({ generation: OnboardingGeneration });
export type OnboardingGenerateResponse = z.infer<typeof OnboardingGenerateResponse>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// `status` replaces the prior boolean `accepted` field: re-scan replaces
// `pending` candidates but must NOT resurrect previously accepted/rejected ones.
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  category: z.string(),
  evidence_path: z.string(),
  evidence_line_start: z.number().int().nullish(),
  evidence_line_end: z.number().int().nullish(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
