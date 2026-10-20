import type { GitHubClient, PrHistoryItem, PrHistoryResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { TtlCache } from './cache.js';
import {
  ENRICH_CACHE_MAX,
  ENRICH_CACHE_TTL_MS,
  MAX_GITHUB_ENRICH,
  MAX_LOG_SCAN,
  MAX_PRIOR_PRS,
  NOTES_MAX,
} from './constants.js';
import { cleanTitle, firstLine, parsePrNumber } from './parse.js';
import { PrHistoryRepository } from './repository.js';

/** Minimal logger shape so the service never imports Fastify. */
export interface HistoryLog {
  info(obj: Record<string, unknown>, msg: string): void;
}

interface PrMeta {
  title: string;
  author: string;
  body: string | null;
}

interface Candidate {
  n: number;
  overlap: Set<string>;
  mergedAt: number;
  subject: string;
  author: string;
}

function toTime(date: string): number {
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Prior PRs touching the current PR's files. Reads the local clone's
 * (shallow) git log; PR numbers come from merge/squash subjects. Never calls
 * an LLM and never logs PR bodies.
 */
export class PrHistoryService {
  repo: PrHistoryRepository;
  /** GitHub-enriched PR metadata keyed by `${repoId}:${number}`, so repeated loads skip GitHub. */
  private enrichCache = new TtlCache<PrMeta>(ENRICH_CACHE_MAX, ENRICH_CACHE_TTL_MS);

  constructor(private container: Container) {
    this.repo = new PrHistoryRepository(container.db);
  }

  async build(workspaceId: string, prId: string, log?: HistoryLog): Promise<PrHistoryResponse> {
    const t0 = Date.now();
    const { reviewRepo, git } = this.container;
    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await reviewRepo.getRepo(pull.repoId);
    if (!repoRow?.clonePath) return { history: [], degraded: true, reason: 'no_clone' };

    const files = new Set((await reviewRepo.getPrFiles(prId)).map((f) => f.path));
    const ref = { owner: repoRow.owner, name: repoRow.name };

    let commits;
    try {
      commits = (await git.log(ref)).slice(0, MAX_LOG_SCAN);
    } catch {
      return { history: [], degraded: true, reason: 'git_failed' };
    }
    if (commits.length <= 1) return { history: [], degraded: true, reason: 'shallow_history' };

    const byNumber = new Map<number, Candidate>();
    for (const c of commits) {
      const n = parsePrNumber(c.message);
      if (n === null || n === pull.number) continue;
      let changed: string[];
      try {
        changed = await git.diffNameOnly(ref, `${c.sha}^1`, c.sha);
      } catch {
        continue; // shallow boundary: no parent
      }
      const overlap = changed.filter((p) => files.has(p));
      if (overlap.length === 0) continue;
      const time = toTime(c.date);
      const existing = byNumber.get(n);
      if (existing) {
        for (const p of overlap) existing.overlap.add(p);
        if (time > existing.mergedAt) {
          existing.mergedAt = time;
          existing.subject = c.message;
          existing.author = c.author;
        }
      } else {
        byNumber.set(n, { n, overlap: new Set(overlap), mergedAt: time, subject: c.message, author: c.author });
      }
    }

    const top = [...byNumber.values()].sort((a, b) => b.mergedAt - a.mergedAt).slice(0, MAX_PRIOR_PRS);

    const dbRows = await this.repo.findPullsByNumbers(
      workspaceId,
      pull.repoId,
      top.map((c) => c.n),
    );
    const meta = new Map<number, PrMeta>(
      dbRows.map((r) => [r.number, { title: r.title, author: r.author, body: r.body }]),
    );

    let enrichedFromGithub = 0;
    const missing: Candidate[] = [];
    for (const c of top) {
      if (meta.has(c.n)) continue;
      const cached = this.enrichCache.get(`${pull.repoId}:${c.n}`);
      if (cached) meta.set(c.n, cached);
      else missing.push(c);
    }
    const toFetch = missing.slice(0, MAX_GITHUB_ENRICH);
    if (toFetch.length > 0) {
      let gh: GitHubClient | null = null;
      try {
        gh = await this.container.github();
      } catch {
        gh = null; // no token: degrade to commit data
      }
      if (gh) {
        const client = gh;
        const results = await Promise.allSettled(toFetch.map((c) => client.getPullRequest(ref, c.n)));
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return; // fall back to commit subject/author
          const c = toFetch[i]!;
          const m: PrMeta = { title: r.value.title, author: r.value.author, body: r.value.body ?? null };
          meta.set(c.n, m);
          this.enrichCache.set(`${pull.repoId}:${c.n}`, m);
          enrichedFromGithub++;
        });
      }
    }

    const history: PrHistoryItem[] = top.map((c) => {
      const m = meta.get(c.n);
      return {
        pr_number: c.n,
        title: m?.title || cleanTitle(c.subject),
        merged_at: new Date(c.mergedAt).toISOString(),
        author: m?.author || c.author,
        files_overlap: [...c.overlap].sort(),
        notes: firstLine(m?.body, NOTES_MAX),
      };
    });

    log?.info(
      {
        event: 'history.read',
        prId,
        commitsScanned: commits.length,
        found: history.length,
        enrichedFromGithub,
        ms: Date.now() - t0,
      },
      'prior PR history read from local git clone (no LLM)',
    );
    return { history, degraded: false, reason: null };
  }
}
