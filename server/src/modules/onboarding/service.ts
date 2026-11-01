import { randomUUID } from 'node:crypto';
import {
  Onboarding,
  OnboardingErrorReason,
  type OnboardingAvailability,
  type OnboardingGeneration,
  type OnboardingGenerateResponse,
  type OnboardingTourResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { IndexState } from '../repo-intel/types.js';
import {
  ERR_REPO_NOT_FOUND,
  LOG_EVENT_GET,
  ONBOARDING_JOB_KIND,
  QUEUE_GRACE_MS,
  REASON,
} from './constants.js';
import { runGeneration, type JobLogger } from './job.js';
import {
  OnboardingRepository,
  type OnboardingRepoRow,
  type OnboardingRow,
} from './repository.js';
import { GenerationJobPayload } from './schemas.js';

/** Raised when generation can't start; the route turns it into the spec's 409 body. */
export class OnboardingUnavailable extends Error {
  constructor(public readonly reason: NonNullable<OnboardingAvailability['reason']>) {
    super(reason === 'not_cloned' ? 'Repository is not cloned yet' : 'Repository is not indexed yet');
    this.name = 'OnboardingUnavailable';
  }
}

function availabilityOf(
  container: Container,
  repo: OnboardingRepoRow,
  state: IndexState,
): OnboardingAvailability {
  let reason: OnboardingAvailability['reason'] = null;
  if (!repo.clonePath) reason = 'not_cloned';
  else if (
    !container.config.repoIntelEnabled ||
    state.degraded ||
    (state.status !== 'full' && state.status !== 'partial')
  ) {
    reason = 'no_index';
  }
  return { can_generate: reason === null, reason };
}

function generationOf(row: OnboardingRow | null): OnboardingGeneration | null {
  if (!row?.generationId || !row.generationStartedAt) return null;
  const status = row.generationStatus;
  if (status !== 'generating' && status !== 'done' && status !== 'failed') return null;
  const reason = OnboardingErrorReason.safeParse(row.generationError);
  return {
    id: row.generationId,
    status,
    started_at: row.generationStartedAt.toISOString(),
    finished_at: row.generationFinishedAt?.toISOString() ?? null,
    error_reason: status === 'failed' && reason.success ? reason.data : null,
  };
}

/**
 * Onboarding Tour service. Reads are pure DB + index-state lookups (no git, no
 * LLM); generation is a background job started by `startGeneration`. Every
 * entry point resolves the repo inside the workspace BEFORE any repo-intel
 * facade call (the facade takes only a repo id).
 */
export class OnboardingService {
  private repository: OnboardingRepository;

  constructor(
    private container: Container,
    private logger: () => JobLogger,
  ) {
    this.repository = new OnboardingRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRow> {
    const repo = await this.repository.getRepo(workspaceId, repoId);
    if (!repo) throw new AppError(ERR_REPO_NOT_FOUND, 'Repository not found', 404);
    return repo;
  }

  async getTour(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const started = Date.now();
    const repo = await this.requireRepo(workspaceId, repoId);
    const overdueBefore = new Date(Date.now() - (this.container.config.onboardingTimeoutMs + QUEUE_GRACE_MS));
    await this.repository.expireOverdue(repo.id, overdueBefore);
    const row = await this.repository.getRow(repo.id);
    // A row whose JSON no longer matches the contract (older shape) reads as "no tour".
    const parsed = Onboarding.safeParse(row?.json);
    const tour = parsed.success ? parsed.data : null;
    const state = await this.container.repoIntel.getIndexState(repo.id);
    const current = state.lastIndexedSha || null;
    const response: OnboardingTourResponse = {
      repo_id: repo.id,
      tour,
      generation: generationOf(row),
      availability: availabilityOf(this.container, repo, state),
      stale: !!tour && !!current && tour.source_sha !== current,
      current_index_sha: current,
    };
    this.logger().info(
      { event: LOG_EVENT_GET, repo_id: repo.id, has_tour: tour !== null, ms: Date.now() - started },
      LOG_EVENT_GET,
    );
    return response;
  }

  async startGeneration(workspaceId: string, repoId: string): Promise<OnboardingGenerateResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const state = await this.container.repoIntel.getIndexState(repo.id);
    const availability = availabilityOf(this.container, repo, state);
    if (availability.reason) throw new OnboardingUnavailable(availability.reason);

    const generationId = randomUUID();
    let claimed: OnboardingRow | null = null;
    // Two attempts: the in-flight generation may finish between the claim and the read.
    for (let attempt = 0; attempt < 2 && !claimed; attempt += 1) {
      claimed = await this.repository.claimGeneration(repo.id, generationId, new Date());
      if (claimed) break;
      const inflight = await this.repository.getRow(repo.id);
      if (inflight?.generationStatus === 'generating') {
        const generation = generationOf(inflight);
        if (generation) return { generation };
      }
    }
    if (!claimed) throw new AppError('internal_error', 'Could not start generation', 500);

    const payload: GenerationJobPayload = { workspaceId, repoId: repo.id, generationId };
    try {
      const job = await this.container.jobs.enqueue(workspaceId, ONBOARDING_JOB_KIND, payload);
      // The handler never throws; this only fires if the runner itself gave up
      // (its hard timeout is a real timeout and must be recorded as such).
      job.done.catch(async (err: unknown) => {
        const reason = err instanceof TimeoutError ? REASON.timeout : REASON.internal;
        this.logger().error({ repo_id: repo.id, generation_id: generationId, err: (err as Error).message }, 'onboarding: job failed');
        await this.repository
          .finishGeneration(repo.id, generationId, { status: 'failed', error: reason })
          .catch(() => false);
      });
    } catch (err) {
      this.logger().error({ repo_id: repo.id, generation_id: generationId, err: (err as Error).message }, 'onboarding: enqueue failed');
      await this.repository.finishGeneration(repo.id, generationId, { status: 'failed', error: REASON.internal });
    }
    const generation = generationOf(claimed);
    if (!generation) throw new AppError('internal_error', 'Could not start generation', 500);
    return { generation };
  }

  registerJobHandler(): void {
    this.container.jobs.register(ONBOARDING_JOB_KIND, async (raw) => {
      const payload = GenerationJobPayload.safeParse(raw);
      if (!payload.success) return;
      await runGeneration(
        this.container,
        { repository: this.repository, logger: this.logger },
        payload.data,
      );
    });
  }

  /** Boot reaper (AC-15): `generating` rows left by a dead process become `failed/interrupted`. */
  async reapOnBoot(): Promise<number> {
    const reaped = await this.repository.reapGenerating();
    if (reaped > 0) this.logger().info({ reaped }, 'reaped interrupted onboarding generations on boot');
    return reaped;
  }
}
