import { describe, expect, it, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import { runGeneration, type JobDeps } from './job.js';
import type { OnboardingRepository } from './repository.js';

const TIMEOUT_MS = 60_000;

function setup(claimedAgoMs: number) {
  const finishGeneration = vi.fn(async () => true);
  const getRepo = vi.fn(async () => null);
  const repository = {
    getRow: vi.fn(async () => ({
      generationId: 'g1',
      generationStatus: 'generating',
      generationStartedAt: new Date(Date.now() - claimedAgoMs),
    })),
    getRepo,
    finishGeneration,
  } as unknown as OnboardingRepository;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: JobDeps = { repository, logger: () => logger };
  const container = { config: { onboardingTimeoutMs: TIMEOUT_MS } } as unknown as Container;
  return { container, deps, finishGeneration, getRepo };
}

describe('runGeneration deadline', () => {
  it('counts time spent queued: a job that starts past claim + timeout fails as timeout without running', async () => {
    const { container, deps, finishGeneration, getRepo } = setup(TIMEOUT_MS + 1_000);
    await runGeneration(container, deps, { workspaceId: 'w1', repoId: 'r1', generationId: 'g1' });
    expect(getRepo).not.toHaveBeenCalled();
    expect(finishGeneration).toHaveBeenCalledWith('r1', 'g1', { status: 'failed', error: 'timeout' });
  });

  it('runs the body while the claim-based budget remains', async () => {
    const { container, deps, finishGeneration, getRepo } = setup(1_000);
    await runGeneration(container, deps, { workspaceId: 'w1', repoId: 'r1', generationId: 'g1' });
    expect(getRepo).toHaveBeenCalled();
    // repo not found → body records failed/internal, not a timeout
    expect(finishGeneration).toHaveBeenCalledWith('r1', 'g1', { status: 'failed', error: 'internal' });
  });
});
