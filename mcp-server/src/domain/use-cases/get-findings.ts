import { DomainError } from '../errors';
import { DEFAULT_FINDINGS_LIMIT, runningResult, shapeReview } from '../findings';
import type { UseCaseDeps } from '../ports';
import { resolvePr, resolveRepo } from '../resolve';
import type { ResponseFormat, Review, ReviewResult, Severity } from '../types';

export interface GetFindingsInput {
  repo: string;
  pr: number;
  run_id?: string;
  /** Optional filter: agent id or case-insensitive name. */
  agent?: string;
  severity?: Severity;
  /** Default 20 (1-50), applied by the use case. */
  limit?: number;
  /** Default 'concise', applied by the use case. */
  response_format?: ResponseFormat;
}

export type GetFindings = (input: GetFindingsInput, signal?: AbortSignal) => Promise<ReviewResult>;

function matchesAgent(review: Review, agent: string): boolean {
  return review.agent_id === agent || review.agent_name.trim().toLowerCase() === agent.trim().toLowerCase();
}

/** Latest (or run_id-pinned) review of a PR, shaped for the caller. Never starts a run. */
export function createGetFindings({ api }: UseCaseDeps): GetFindings {
  return async (input, signal) => {
    const repo = await resolveRepo(api, input.repo, signal);
    const pull = await resolvePr(api, repo, input.pr, signal);
    const reviews = (await api.listReviews(pull.id, signal)).filter((r) => r.kind === 'review');

    const shape = (review: Review): ReviewResult => {
      const opts = {
        repo: repo.full_name,
        pr: pull.number,
        limit: input.limit ?? DEFAULT_FINDINGS_LIMIT,
        format: input.response_format ?? 'concise',
      };
      return shapeReview(review, input.severity ? { ...opts, severity: input.severity } : opts);
    };

    if (input.run_id !== undefined) {
      const runId = input.run_id;
      const hit = reviews.find((r) => r.run_id === runId);
      if (hit) return shape(hit);

      const run = (await api.listRuns(pull.id, signal)).find((r) => r.run_id === runId);
      if (!run) {
        throw new DomainError('RUN_NOT_FOUND', { run_id: runId, repo: repo.full_name, pr: pull.number });
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw new DomainError('RUN_FAILED', { run_id: runId, status: run.status, error: run.error });
      }
      return runningResult({
        repo: repo.full_name,
        pr: pull.number,
        agent: run.agent_name ?? '',
        run_id: runId,
      });
    }

    const agent = input.agent;
    const latest = agent === undefined ? reviews[0] : reviews.find((r) => matchesAgent(r, agent));
    if (!latest) {
      throw new DomainError('NO_REVIEWS', {
        repo: repo.full_name,
        pr: pull.number,
        ...(agent !== undefined ? { agent } : {}),
      });
    }
    return shape(latest);
  };
}
