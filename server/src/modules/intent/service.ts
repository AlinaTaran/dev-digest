import type { Intent, PrIntentBrief } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import type * as t from '../../db/schema.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { NotFoundError } from '../../platform/errors.js';
import { classifyIntent, type LoggerLike } from './classifier.js';
import { hunkHeaders } from './signals.js';
import { resolveReferences } from './references.js';
import { buildClassifierInput, type ClassifierSignals } from './prompts.js';
import type { UnifiedDiff } from '@devdigest/shared';

type RepoRow = typeof t.repos.$inferSelect;

const LINKED_ISSUE_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/**
 * Intent service — a per-workspace, cheap, cached PR-intent classifier. Reads
 * ONLY through `container.reviewRepo` (data), `container.llm` (LLM),
 * `container.git`/`container.github` (best-effort enrichment). No new
 * repository: `upsertIntent`/`getIntent`/`getPull`/`getRepo` already live on
 * the shared `ReviewRepository`.
 */
export class IntentService {
  constructor(private container: Container) {}

  /**
   * `getPull` (→ `NotFoundError`); cache hit (`getIntent`) ⇒ return instantly (no
   * LLM call); miss ⇒ load the diff and `compute()` (1 LLM call, then cached).
   * `risks` is always `[]`; legacy `pr_brief` rows are never read.
   */
  async getOrCompute(workspaceId: string, prId: string, logger: LoggerLike): Promise<PrIntentBrief> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const cachedIntent = await this.container.reviewRepo.getIntent(prId);
    if (cachedIntent) return { pr_id: prId, ...cachedIntent, risks: [] };

    const repo = await this.getRepoOrThrow(pull.repoId);
    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repo);
    return this.compute({ workspaceId, pull, repo, diff, logger });
  }

  /** Like `getOrCompute` but ALWAYS recomputes (overwrites the cached `pr_intent` row). */
  async recompute(workspaceId: string, prId: string, logger: LoggerLike): Promise<PrIntentBrief> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repo = await this.getRepoOrThrow(pull.repoId);
    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repo);
    return this.compute({ workspaceId, pull, repo, diff, logger });
  }

  /**
   * Used by the review executor (a separate task) to compute/refresh the
   * intent using an already-loaded diff, avoiding a second `loadDiff`. Returns
   * the bare `Intent` (not the `pr_id`/`risks`-carrying record) since the
   * caller already has the `pull`.
   */
  async computeForRun(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    logger: LoggerLike,
  ): Promise<Intent> {
    const { pr_id: _prId, risks: _risks, ...intent } = await this.compute({
      workspaceId,
      pull,
      repo,
      diff,
      logger,
    });
    return intent;
  }

  /**
   * Gather signals → resolve the feature model → classify intent (1 LLM call)
   * → persist → return the record with `risks: []`. NEVER bails just because
   * the body is empty — each signal gatherer returns `undefined` for absent
   * enrichment.
   */
  private async compute(args: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRow;
    diff: UnifiedDiff;
    logger: LoggerLike;
  }): Promise<PrIntentBrief> {
    const { workspaceId, pull, repo, diff, logger } = args;
    const { files, headers } = hunkHeaders(diff);

    // Exclude the PR's own linked issue from the reference resolver so the same
    // `#N` isn't fetched twice and duplicated across the two prompt sections.
    const linkedIssueNumber = pull.body?.match(LINKED_ISSUE_RE)?.[1];
    const excludeIssues = linkedIssueNumber ? [Number(linkedIssueNumber)] : [];

    const [linkedIssue, planText] = await Promise.all([
      this.resolveLinkedIssue(pull.body, repo),
      resolveReferences(pull.body, { owner: repo.owner, name: repo.name }, this.container, excludeIssues),
    ]);

    const signals: ClassifierSignals = {
      title: pull.title,
      body: pull.body ?? undefined,
      linkedIssue,
      planText,
      files,
      hunkHeaderText: headers,
    };
        const input = buildClassifierInput(signals);

    const intent = await this.runIntentClassifier(workspaceId, input, diff.raw, logger);
    await this.container.reviewRepo.upsertIntent(pull.id, intent);
    return { pr_id: pull.id, ...intent, risks: [] };
  }

  private async runIntentClassifier(
    workspaceId: string,
    input: string,
    diffRaw: string,
    logger: LoggerLike,
  ): Promise<Intent> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider);
    return classifyIntent({ llm, model, input, diffRaw, logger });
  }

  private async getRepoOrThrow(repoId: string): Promise<RepoRow> {
    const repo = await this.container.reviewRepo.getRepo(repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Best-effort: the PR's own linked issue (`closes #N` / `fixes #N` / `resolves #N` / bare `#N`). */
  private async resolveLinkedIssue(
    body: string | null,
    repo: RepoRow,
  ): Promise<{ title: string; body?: string } | undefined> {
    if (!body) return undefined;
    const m = body.match(LINKED_ISSUE_RE);
    if (!m) return undefined;
    try {
      const gh = await this.container.github();
      const issue = await gh.getIssue({ owner: repo.owner, name: repo.name }, Number(m[1]));
      return { title: issue.title, body: issue.body ?? undefined };
    } catch {
      return undefined; // no GitHub token configured / API error — best-effort
    }
  }
}
