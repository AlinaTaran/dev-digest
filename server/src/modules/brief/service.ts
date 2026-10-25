import { PrBrief, type PrBriefResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { PullRow } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { briefFailed, briefUnavailable, classifyLlmError, type BriefFailureReason } from './errors.js';
import { gatherFacts } from './facts.js';
import { groundBrief, type GroundContext } from './ground.js';
import { InflightRegistry } from './inflight.js';
import { buildBriefInput } from './input.js';
import { maskBrief } from './mask.js';
import { BRIEF_MODEL_SCHEMA_MODE, modelSchemaFor, toDraft } from './model-schema.js';
import { BRIEF_SCHEMA_NAME } from './prompts.js';
import { BriefRepository } from './repository.js';

/** Minimal structured logger (satisfied by Fastify's `app.log`). Never receives PR text or model output. */
export interface BriefLog {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Marks an error raised by the model call / model-output validation (as opposed to DB or internal bugs). */
class LlmStageError extends Error {
  constructor(public readonly original: unknown) {
    super('llm stage failed');
    this.name = 'LlmStageError';
  }
}

/** PR-text-free description of a failure for logs (NFR-8): never message text that may embed prompt/model/DB-param content. */
function describeError(err: unknown): Record<string, unknown> {
  const e = (err ?? {}) as { name?: string; code?: unknown; message?: unknown; issues?: Array<{ code?: string }>; cause?: { code?: unknown } };
  const out: Record<string, unknown> = { error_name: e.name ?? typeof err };
  const code = e.code ?? e.cause?.code;
  if (code !== undefined) out.error_code = String(code);
  if (Array.isArray(e.issues)) out.issue_codes = e.issues.map((i) => i.code).slice(0, 10);
  return out;
}

/** Counters for the one `brief.generate` log line; filled while the pipeline runs. */
interface GenStats {
  llm_calls: 0 | 1;
  attempts: number;
  input_chars: Record<string, number>;
  input_tokens_est: number;
  input_truncated: string[];
  missing_inputs: string[];
  specs_used: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  dropped_refs: number;
  adjusted_lines: number;
  risks: number;
  focus: number;
}

const newStats = (): GenStats => ({
  llm_calls: 0,
  attempts: 0,
  input_chars: {},
  input_tokens_est: 0,
  input_truncated: [],
  missing_inputs: [],
  specs_used: 0,
  tokens_in: 0,
  tokens_out: 0,
  cost_usd: null,
  dropped_refs: 0,
  adjusted_lines: 0,
  risks: 0,
  focus: 0,
});

const EVENT_GENERATE = 'brief.generate';

/**
 * PR Brief service. `get` is a pure DB read (no LLM). `generate` runs exactly one structured LLM call
 * per generation; concurrent requests for the same PR join the in-flight one (no second call).
 */
export class BriefService {
  private repo: BriefRepository;
  private registry: InflightRegistry<string, PrBriefResponse>;

  /** `logger` is read lazily so a replaced/spied `app.log` is honoured. */
  constructor(
    private container: Container,
    private logger: () => BriefLog,
  ) {
    this.repo = new BriefRepository(container.db);
    this.registry = new InflightRegistry(container.config.briefTimeoutMs);
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const t0 = Date.now();
    const pull = await this.requirePull(workspaceId, prId);
    const parsed = PrBrief.safeParse(await this.repo.getBriefJson(prId));
    const brief = parsed.success ? parsed.data : null; // legacy / invalid rows read as "no brief" (AC-3)
    const res: PrBriefResponse = {
      pr_id: prId,
      brief,
      generating: this.registry.has(prId),
      stale: !!brief && brief.meta.head_sha !== pull.headSha,
      current_head_sha: pull.headSha,
    };
    this.logger().info({ event: 'brief.get', pr_id: prId, has_brief: brief !== null, ms: Date.now() - t0 }, 'brief.get');
    return res;
  }

  async generate(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const t0 = Date.now();
    const pull = await this.requirePull(workspaceId, prId);
    const stats = newStats();
    let provider = '';
    let model = '';
    let joined = false;

    const emit = (outcome: string, errorReason: string | null): void =>
      this.logger().info(
        {
          event: EVENT_GENERATE,
          pr_id: prId,
          head_sha: pull.headSha,
          provider,
          model,
          ...stats,
          joined_inflight: joined,
          schema_mode: BRIEF_MODEL_SCHEMA_MODE,
          outcome,
          error_reason: errorReason,
          ms: Date.now() - t0,
        },
        EVENT_GENERATE,
      );
    const fail = (err: unknown): never => {
      const original = err instanceof LlmStageError ? err.original : err;
      const timedOut = original instanceof TimeoutError || (original as { name?: string })?.name === 'TimeoutError';
      const llmFailure = err instanceof LlmStageError || timedOut;
      const base = { event: `${EVENT_GENERATE}.error`, pr_id: prId, stage: llmFailure ? 'llm' : 'internal', ...describeError(original) };
      // Provider messages are only logged for the model-call stage, truncated; never for DB/internal errors.
      const msg = (original as { message?: unknown })?.message;
      const withMsg =
        err instanceof LlmStageError && typeof msg === 'string' && !Array.isArray((original as { issues?: unknown }).issues)
          ? { ...base, error_message: msg.slice(0, 200) }
          : base;
      this.logger().error(withMsg, `${EVENT_GENERATE}.error`);
      if (!llmFailure) {
        emit('failed', 'internal');
        throw new AppError('internal_error', 'Brief generation failed', 500);
      }
      const reason: BriefFailureReason = classifyLlmError(original);
      emit('failed', reason);
      throw briefFailed(reason);
    };

    // Join an in-flight generation: no precondition re-check, no second LLM call.
    const running = this.registry.get(prId);
    if (running) {
      joined = true;
      try {
        const res = await this.registry.wait(running);
        emit('ok', null);
        return res;
      } catch (err) {
        return fail(err);
      }
    }

    if ((await this.container.reviewRepo.getPrFiles(prId)).length === 0) {
      emit('unavailable', 'pr_not_synced');
      throw briefUnavailable('pr_not_synced');
    }

    let llm;
    try {
      ({ provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief'));
      llm = await this.container.llm(provider as 'openai' | 'anthropic' | 'openrouter');
    } catch (err) {
      if (err instanceof ConfigError) {
        emit('unavailable', 'llm_not_configured');
        throw briefUnavailable('llm_not_configured');
      }
      throw err;
    }

    const entry = this.registry.start(
      prId,
      (deadline) => this.pipeline({ workspaceId, pull, llm, provider, model, deadline, stats }),
      (outcome, pastDeadline) => {
        if (pastDeadline) {
          this.logger().info(
            { event: 'brief.generate.abandoned_settled', pr_id: prId, outcome, ms: Date.now() - t0 },
            'brief.generate.abandoned_settled',
          );
        }
      },
    );
    joined = entry.joined; // false unless another request won the race while we resolved the model
    try {
      const res = await this.registry.wait(entry);
      emit('ok', null);
      return res;
    } catch (err) {
      return fail(err);
    }
  }

  private async pipeline(a: {
    workspaceId: string;
    pull: PullRow;
    llm: Awaited<ReturnType<Container['llm']>>;
    provider: string;
    model: string;
    deadline: number;
    stats: GenStats;
  }): Promise<PrBriefResponse> {
    const { pull, stats } = a;
    const facts = await gatherFacts(this.container, a.workspaceId, pull);
    const input = buildBriefInput({
      title: pull.title,
      intent: facts.intent,
      blast: facts.blastInput,
      diffFiles: facts.diffFiles,
      description: facts.description,
      specs: facts.specs.entries,
    });
    const truncated = [...input.truncated];
    if (facts.specs.moreAvailable && !truncated.includes('specs')) truncated.push('specs');
    const specsInPrompt = Object.keys(input.charsBySource)
      .filter((k) => k.startsWith('spec:'))
      .map((k) => k.slice('spec:'.length));
    stats.input_chars = input.charsBySource;
    stats.input_tokens_est = input.tokensEst;
    stats.input_truncated = truncated;
    stats.missing_inputs = facts.missingInputs;
    stats.specs_used = specsInPrompt.length;

    stats.llm_calls = 1;
    let result;
    let draft;
    try {
      result = await a.llm.completeStructured({
        model: a.model,
        schema: modelSchemaFor(BRIEF_MODEL_SCHEMA_MODE),
        schemaName: BRIEF_SCHEMA_NAME,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        // Bound the adapter (incl. its retries) by what is left of the generation deadline (AC-14).
        timeoutMs: Math.max(1, a.deadline - Date.now()),
      });
      stats.attempts = result.attempts;
      stats.tokens_in = result.tokensIn;
      stats.tokens_out = result.tokensOut;
      stats.cost_usd = result.costUsd;
      draft = toDraft(result.data, BRIEF_MODEL_SCHEMA_MODE);
    } catch (err) {
      throw err instanceof TimeoutError ? err : new LlmStageError(err);
    }
    const ctx: GroundContext = {
      diff: new Map(facts.diffFiles.map((f) => [f.path, { ranges: f.ranges, hasLines: f.hasLines }])),
      blast: facts.blastGround,
    };
    const grounded = groundBrief(draft, ctx);
    stats.dropped_refs = grounded.dropped_refs;
    stats.adjusted_lines = grounded.adjusted_lines;
    stats.risks = grounded.risks.length;
    stats.focus = grounded.review_focus.length;
    const masked = maskBrief({
      summary: draft.summary,
      risks: grounded.risks,
      review_focus: grounded.review_focus,
    });

    const brief = PrBrief.parse({
      summary: masked.summary,
      risks: { risks: masked.risks },
      review_focus: masked.review_focus,
      intent: facts.intent,
      blast: facts.blastSnapshot,
      history: null,
      meta: {
        head_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        model: { provider: a.provider, model: a.model },
        missing_inputs: facts.missingInputs,
        blast_reason: facts.blastReason,
        input_truncated: truncated,
        input_tokens_est: input.tokensEst,
        specs_used: specsInPrompt,
        specs_skipped: facts.specs.skipped,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        dropped_refs: grounded.dropped_refs,
        adjusted_lines: grounded.adjusted_lines,
      },
    });

    // A late model answer is never saved (AC-14): the requester has already been told `timeout`.
    // The deadline is re-checked inside the write transaction right before commit, so a write that
    // straddles the deadline is rolled back instead of landing after the 502.
    const beforeDeadline = (): boolean => Date.now() < a.deadline;
    if (!beforeDeadline() || !(await this.repo.upsertBriefUnless(pull.id, brief, beforeDeadline))) {
      throw new TimeoutError(this.container.config.briefTimeoutMs);
    }
    return { pr_id: pull.id, brief, generating: false, stale: false, current_head_sha: pull.headSha };
  }
}
