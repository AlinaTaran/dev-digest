import {
  Onboarding,
  type OnboardingDegradedReason,
  type OnboardingErrorReason,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import type { IndexState } from '../repo-intel/types.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { FEATURE_MODEL_ID, LOG_EVENT_GENERATE, REASON } from './constants.js';
import { buildDeterministicSections } from './deterministic.js';
import { ONBOARDING_DRAFT_SCHEMA_NAME, OnboardingDraft } from './draft-schema.js';
import { collectFacts, type Facts } from './facts.js';
import { groundDraft } from './ground.js';
import { buildUserPrompt } from './inputs.js';
import { normalizeRepoPath, PathIndex } from './paths.js';
import type { OnboardingRepository } from './repository.js';
import type { GenerationJobPayload } from './schemas.js';

export interface JobLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface JobDeps {
  repository: OnboardingRepository;
  logger: () => JobLogger;
}

/** Generations currently executing in this process (guards a JobRunner retry from re-running one). */
const running = new Set<string>();

type Outcome = 'done' | 'degraded_done' | 'failed' | 'superseded';

interface LogFields {
  repo_id: string;
  generation_id: string;
  source_sha?: string;
  files_indexed?: number;
  index_status?: string;
  model?: string;
  input_tokens_est?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
  dropped_refs?: number;
  counts?: Record<string, number>;
  outcome?: Outcome;
  error_reason?: OnboardingErrorReason;
}

function isAvailable(state: IndexState): boolean {
  return !state.degraded && (state.status === 'full' || state.status === 'partial');
}

/** Real fan-in for every path the tour may show; the model's numbers are never used (AC-30). */
async function fanInFor(container: Container, repoId: string, paths: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  return container.repoIntel.getFanIn(repoId, unique).catch(() => new Map<string, number>());
}

function degradedReasons(state: IndexState, facts: Facts, extra?: OnboardingDegradedReason): OnboardingDegradedReason[] {
  const reasons: OnboardingDegradedReason[] = [];
  if (state.status === 'partial') reasons.push('index_partial');
  if (!facts.hasImportGraph) reasons.push('no_import_graph');
  if (extra) reasons.push(extra);
  return reasons;
}

function assemble(
  state: IndexState,
  facts: Facts,
  sections: Onboarding['sections'],
  reasons: OnboardingDegradedReason[],
  model: { provider: string; model: string } | null,
  droppedRefs: number,
): Onboarding {
  return Onboarding.parse({
    generated_at: new Date().toISOString(),
    source_sha: facts.sourceSha,
    files_indexed: state.filesIndexed,
    index_status: state.status === 'partial' ? 'partial' : 'full',
    degraded: reasons.length > 0,
    reasons,
    model,
    dropped_refs: droppedRefs,
    sections,
  });
}

/**
 * Run one generation to a terminal state. NEVER throws (the JobRunner would
 * retry and re-call the LLM, NFR-5): every failure becomes a `failed/<reason>`
 * row, and every terminal write is conditional on this generation being the
 * in-flight one, so a late completion can't clobber newer state.
 */
export async function runGeneration(
  container: Container,
  deps: JobDeps,
  payload: GenerationJobPayload,
): Promise<void> {
  const { workspaceId, repoId, generationId } = payload;
  if (running.has(generationId)) return;
  running.add(generationId);
  const started = Date.now();
  const log: LogFields = { repo_id: repoId, generation_id: generationId };
  const timeoutMs = container.config.onboardingTimeoutMs;

  const finish = async (
    status: 'done' | 'failed',
    extra: { error?: OnboardingErrorReason; tour?: Onboarding } = {},
  ): Promise<boolean> => {
    try {
      return await deps.repository.finishGeneration(repoId, generationId, { status, ...extra });
    } catch (err) {
      deps.logger().error({ repo_id: repoId, generation_id: generationId, err: (err as Error).message }, 'onboarding: terminal write failed');
      return false;
    }
  };

  let deadline = started + timeoutMs;
  try {
    const current = await deps.repository.getRow(repoId);
    if (!current || current.generationId !== generationId || current.generationStatus !== 'generating') return;
    // Same clock as GET's overdue check (the claim time): time spent queued behind
    // clone/index jobs counts against the budget, so GET never expires a live run.
    deadline = (current.generationStartedAt?.getTime() ?? started) + timeoutMs;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TimeoutError(timeoutMs); // withTimeout(…, <=0) would not time out at all
    await withTimeout(body(), remaining);
  } catch (err) {
    const reason = err instanceof TimeoutError ? REASON.timeout : REASON.internal;
    log.outcome = (await finish('failed', { error: reason })) ? 'failed' : 'superseded';
    log.error_reason = reason;
  } finally {
    running.delete(generationId);
    deps.logger().info({ event: LOG_EVENT_GENERATE, ...log, ms: Date.now() - started }, LOG_EVENT_GENERATE);
  }

  async function body(): Promise<void> {
    const repo = await deps.repository.getRepo(workspaceId, repoId);
    const state = repo ? await container.repoIntel.getIndexState(repoId) : null;
    if (!repo || !state || !isAvailable(state)) {
      log.outcome = (await finish('failed', { error: REASON.internal })) ? 'failed' : 'superseded';
      log.error_reason = REASON.internal;
      return;
    }
    const facts = await collectFacts(container, repo, state);
    log.source_sha = facts.sourceSha;
    log.files_indexed = state.filesIndexed;
    log.index_status = state.status;

    let llmFailure: 'llm_unavailable' | 'llm_failed' | null = null;
    let draft: OnboardingDraft | null = null;
    let modelChoice: { provider: string; model: string } | null = null;
    try {
      modelChoice = await resolveFeatureModel(container, workspaceId, FEATURE_MODEL_ID);
      log.model = `${modelChoice.provider}/${modelChoice.model}`;
      const llm = await container.llm(modelChoice.provider as 'openai' | 'anthropic' | 'openrouter');
      const system = await renderPrompt('onboarding.system.md', {});
      const user = buildUserPrompt({
        repoFullName: repo.fullName,
        filesIndexed: state.filesIndexed,
        indexStatus: state.status === 'partial' ? 'partial' : 'full',
        topRanked: facts.topRanked,
        chains: facts.chains,
        endpoints: facts.endpoints,
        files: facts.files,
      });
      log.input_tokens_est = user.estTokens;
      const res = await llm.completeStructured({
        model: modelChoice.model,
        schema: OnboardingDraft,
        schemaName: ONBOARDING_DRAFT_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user.text },
        ],
        timeoutMs: Math.max(1, deadline - Date.now()),
      });
      log.tokens_in = res.tokensIn;
      log.tokens_out = res.tokensOut;
      log.cost_usd = res.costUsd;
      draft = res.data;
    } catch (err) {
      llmFailure = err instanceof ConfigError ? 'llm_unavailable' : 'llm_failed';
    }

    if (draft && modelChoice) {
      const draftPaths = [
        ...draft.critical_paths.map((c) => normalizeRepoPath(c.path)),
        ...draft.reading_path.map((c) => normalizeRepoPath(c.path)),
      ].filter((p): p is string => p !== null);
      const fanIn = await fanInFor(container, repoId, [...facts.topRanked, ...facts.chains.flat(), ...draftPaths]);
      const readable = new Set(facts.files.map((f) => f.path));
      const grounded = groundDraft(draft, {
        indexed: new PathIndex(facts.indexedFiles),
        tracked: facts.tracked ? new PathIndex(facts.tracked) : null,
        fanIn,
        commands: {
          tracked: facts.tracked ? new PathIndex(facts.tracked) : null,
          readable,
          manifests: facts.manifests,
          makefiles: facts.makefiles,
        },
      });
      const tour = assemble(state, facts, grounded.sections, degradedReasons(state, facts), modelChoice, grounded.droppedRefs);
      log.dropped_refs = grounded.droppedRefs;
      log.counts = grounded.counts;
      const written = await finish('done', { tour });
      log.outcome = written ? (tour.degraded ? 'degraded_done' : 'done') : 'superseded';
      return;
    }

    // LLM unavailable/failed: keep a previous tour (failed row), else store the deterministic one.
    const reason = llmFailure ?? 'llm_failed';
    log.error_reason = reason;
    const previous = Onboarding.safeParse((await deps.repository.getRow(repoId))?.json);
    if (previous.success) {
      log.outcome = (await finish('failed', { error: reason })) ? 'failed' : 'superseded';
      return;
    }
    const fanIn = await fanInFor(container, repoId, [...facts.topRanked.slice(0, 8), ...facts.chains.flat()]);
    const sections = buildDeterministicSections({
      indexedFiles: facts.indexedFiles,
      topRanked: facts.topRanked,
      chains: facts.chains,
      fanIn,
      rootPackageJson: facts.rootPackageJson,
      lockfiles: facts.lockfiles,
    });
    const tour = assemble(state, facts, sections, degradedReasons(state, facts, reason), null, 0);
    log.outcome = (await finish('done', { tour })) ? 'degraded_done' : 'superseded';
  }
}
