import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import { mapBlast } from './mapper.js';

/** Minimal structured logger (satisfied by Fastify's `req.log`); keeps Fastify out of the service. */
export interface BlastLog {
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Blast-radius service — reads the repo-intel index built at clone time and
 * groups it for the Overview block. No LLM call, no GitHub fetch, no re-parse.
 */
export class BlastService {
  constructor(private container: Container) {}

  async build(workspaceId: string, prId: string, log?: BlastLog): Promise<BlastRadiusResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // `pr_files` is not unique per path; dedupe before hitting the facade.
    const rows = await this.container.reviewRepo.getPrFiles(prId);
    const files = [...new Set(rows.map((f) => f.path))];

    const t0 = Date.now();
    const [result, state] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, files),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    // Caller line numbers come from the indexed snapshot, so expose its SHA.
    const indexedSha =
      (state.status === 'full' || state.status === 'partial') && state.lastIndexedSha
        ? state.lastIndexedSha
        : null;

    const response = mapBlast(result, {
      maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL,
      bfsDepth: BFS_DEPTH,
      indexedSha,
    });

    log?.info(
      {
        event: 'blast.read_index',
        prId,
        repoId: pull.repoId,
        files: files.length,
        source: result.source ?? (result.degraded ? 'fallback' : 'index'),
        degraded: response.degraded,
        reason: response.reason,
        ...response.stats,
        ms: Date.now() - t0,
      },
      'blast radius read from repo-intel index (no re-parse, no LLM)',
    );

    return response;
  }
}
