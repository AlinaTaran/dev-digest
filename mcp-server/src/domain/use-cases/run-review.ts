import { DomainError, isDomainError } from '../errors';
import { runningResult, shapeReview } from '../findings';
import type { UseCaseDeps } from '../ports';
import { resolveAgent, resolvePr, resolveRepo } from '../resolve';
import type { ReviewResult } from '../types';

/** run_agent_on_pr input. `agent` = id or name; `limit` fixed at 20 by this use case. */
export interface RunReviewInput {
  repo: string;
  pr: number;
  agent: string;
}

export interface RunReviewDeps extends UseCaseDeps {
  pollIntervalMs: number;
  runTimeoutMs: number;
}

export type RunReview = (input: RunReviewInput, signal?: AbortSignal) => Promise<ReviewResult>;

const FINDINGS_LIMIT = 20;
const TRANSIENT = new Set(['API_UNREACHABLE', 'API_TIMEOUT', 'API_SERVER_ERROR']);

/** Spec §4.4 `runReviewAndWait`: resolve -> POST once (never retried) -> poll runs -> fetch review. */
export function createRunReview(deps: RunReviewDeps): RunReview {
  const { api, clock, logger, pollIntervalMs, runTimeoutMs } = deps;

  return async (input, signal) => {
    const repo = await resolveRepo(api, input.repo, signal);
    const pull = await resolvePr(api, repo, input.pr, signal);
    const agent = await resolveAgent(api, input.agent, signal);

    const started = await api.startReview(pull.id, agent.id, signal);
    const runId = started[0]?.run_id;
    if (!runId) {
      throw new DomainError('BAD_RESPONSE', { path: `/pulls/${pull.id}/review`, apiUrl: '' });
    }
    const startedAt = clock.now();

    const running = (): ReviewResult =>
      runningResult({ repo: repo.full_name, pr: input.pr, agent: agent.name, run_id: runId });

    while (!signal?.aborted) {
      let waitMs = pollIntervalMs;
      try {
        const runs = await api.listRuns(pull.id, signal);
        const run = runs.find((r) => r.run_id === runId);
        if (run?.status === 'done') {
          const reviews = await api.listReviews(pull.id, signal);
          const review = reviews.find((r) => r.run_id === runId);
          if (!review) {
            throw new DomainError('REVIEW_MISSING', { run_id: runId, repo: repo.full_name, pr: input.pr });
          }
          return shapeReview(review, {
            repo: repo.full_name,
            pr: input.pr,
            limit: FINDINGS_LIMIT,
            format: 'concise',
          });
        }
        if (run?.status === 'failed' || run?.status === 'cancelled') {
          throw new DomainError('RUN_FAILED', { run_id: runId, status: run.status, error: run.error });
        }
      } catch (err) {
        if (!isDomainError(err)) throw err;
        if (err.code === 'ABORTED') return running();
        if (err.code === 'RATE_LIMITED') {
          const retry = Number(err.details.retryAfterSec);
          if (Number.isFinite(retry)) waitMs = Math.max(waitMs, retry * 1000);
        } else if (TRANSIENT.has(err.code)) {
          logger.warn('transient error while polling run', { run_id: runId, code: err.code });
        } else if (err.code === 'RUN_FAILED' || err.code === 'REVIEW_MISSING') {
          throw err;
        } else {
          // The run is already started: never surface an error without its run_id.
          logger.warn('non-terminal error while polling run', { run_id: runId, code: err.code });
          return running();
        }
      }

      if (clock.now() - startedAt >= runTimeoutMs) break;
      await clock.sleep(Math.min(waitMs, Math.max(0, runTimeoutMs - (clock.now() - startedAt))), signal);
      if (clock.now() - startedAt >= runTimeoutMs) break;
    }
    return running();
  };
}
