import type {
  AgentColumn,
  AgentEstimate,
  FindingGroup,
  MultiAgentRun,
  MultiAgentRunSummary,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRunExecutor, type Logger } from '../reviews/run-executor.js';
import { findingRowToDto } from '../reviews/helpers.js';
import { MultiAgentRepository, type ChildRun, type RunReview } from './repository.js';
import { buildConflicts, deriveStatus, groupFindings, meanEstimate } from './core.js';

const DELETED_AGENT_NAME = 'Deleted agent';
const COLUMN_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;

/**
 * Multi-agent review orchestration: start N agents in parallel on one PR and
 * read back the latest multi-run (columns + computed groups/conflicts).
 */
export class MultiAgentService {
  private repo: MultiAgentRepository;

  constructor(private container: Container) {
    this.repo = new MultiAgentRepository(container.db);
  }

  async startMultiRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRun> {
    const ids = [...new Set(agentIds)];
    if (ids.length < 2) {
      throw new AppError('invalid_multi_run_request', 'A multi-agent run needs at least 2 distinct agents', 400);
    }

    const reviewRepo = this.container.reviewRepo;
    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const agents: AgentRow[] = [];
    for (const id of ids) {
      const agent = await this.container.agentsRepo.getById(workspaceId, id);
      if (!agent) throw new AppError('agent_not_found', `Agent ${id} not found`, 404);
      agents.push(agent);
    }

    const { multiRun, runIds } = await this.repo.createMultiRun(workspaceId, prId, agents);
    const startedAt = Date.now();
    logger?.info({ multi_run_id: multiRun.id, pr_id: prId, agent_count: agents.length }, 'multi_run.start');

    const jobs = agents.map((agent, i) => ({ agent, runId: runIds[i]! }));
    const executor = new ReviewRunExecutor(this.container, reviewRepo, this.container.agentsRepo);
    // Fire-and-forget: the response returns now; children settle in the background.
    void executor
      .executeRuns(workspaceId, pull, repo, jobs, logger, { parallel: true })
      .catch((err) => {
        logger?.error({ multi_run_id: multiRun.id, err: (err as Error).message }, 'multi_run: background execution crashed');
      })
      .then(async () => {
        const children = await this.repo.childRuns(multiRun.id);
        logger?.info(
          {
            multi_run_id: multiRun.id,
            pr_id: prId,
            agent_count: agents.length,
            status: deriveStatus(children.map((c) => c.run.status)),
            duration_ms: Date.now() - startedAt,
          },
          'multi_run.done',
        );
      })
      .catch(() => undefined);

    const columns: AgentColumn[] = agents.map((agent, i) => ({
      run_id: runIds[i]!,
      agent_id: agent.id,
      agent_name: agent.name,
      provider: agent.provider,
      model: agent.model,
      status: 'running',
      error: null,
      verdict: null,
      score: null,
      summary: null,
      duration_ms: null,
      cost_usd: null,
      findings: [],
    }));
    return {
      id: multiRun.id,
      pr_id: prId,
      pr_number: pull.number,
      ran_at: multiRun.ranAt.toISOString(),
      status: 'running',
      agent_count: agents.length,
      total_duration_ms: 0,
      total_cost_usd: null,
      columns,
      groups: [],
      conflicts: [],
    };
  }

  /** The PR's latest multi-run. Groups/conflicts are computed here, never stored. */
  async getLatest(workspaceId: string, prId: string): Promise<MultiAgentRun> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const multiRun = await this.repo.latestMultiRun(workspaceId, prId);
    if (!multiRun) throw new AppError('no_multi_run', 'No multi-agent run for this pull request', 404);

    const children = await this.repo.childRuns(multiRun.id);
    const reviews = await this.repo.reviewsWithFindingsForRuns(children.map((c) => c.run.id));
    const columns = children.map((child) => this.toColumn(child, reviews.get(child.run.id)));

    const groups: FindingGroup[] = groupFindings(columns);
    const durations = columns.flatMap((c) => (c.duration_ms == null ? [] : [c.duration_ms]));
    const costs = columns.flatMap((c) => (c.cost_usd == null ? [] : [c.cost_usd]));
    return {
      id: multiRun.id,
      pr_id: prId,
      pr_number: pull.number,
      ran_at: multiRun.ranAt.toISOString(),
      status: deriveStatus(children.map((c) => c.run.status)),
      agent_count: columns.length,
      total_duration_ms: durations.length ? Math.max(...durations) : 0,
      total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      columns,
      groups,
      conflicts: buildConflicts(groups, columns),
    };
  }

  /** The repo's newest multi-runs (summary rows, newest first). Two queries total. */
  async listRecent(workspaceId: string, repoId: string, limit: number): Promise<MultiAgentRunSummary[]> {
    const rows = await this.repo.recentMultiRuns(workspaceId, repoId, limit);
    const children = await this.repo.childRunsForMultiRuns(rows.map((r) => r.multiRun.id));
    const byRun = new Map<string, typeof children>();
    for (const c of children) {
      if (!c.multiRunId) continue;
      const list = byRun.get(c.multiRunId);
      if (list) list.push(c);
      else byRun.set(c.multiRunId, [c]);
    }
    return rows.map(({ multiRun, prNumber, prTitle }) => {
      const runs = byRun.get(multiRun.id) ?? [];
      const durations = runs.flatMap((c) => (c.durationMs == null ? [] : [c.durationMs]));
      const costs = runs.flatMap((c) => {
        const cost = this.container.priceBook.resolve(c.costUsd, c.model, c.tokensIn, c.tokensOut);
        return cost == null ? [] : [cost];
      });
      return {
        id: multiRun.id,
        pr_number: prNumber,
        pr_title: prTitle,
        status: deriveStatus(runs.map((c) => c.status)),
        agent_count: runs.length,
        ran_at: multiRun.ranAt.toISOString(),
        duration_ms: durations.length ? Math.max(...durations) : 0,
        cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      };
    });
  }

  /** Mean duration/cost of each workspace agent's last 5 done runs. */
  async estimates(workspaceId: string): Promise<AgentEstimate[]> {
    const [agents, recent] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.recentDoneRunsPerAgent(workspaceId, 5),
    ]);
    return agents.map((agent) => {
      const runs = recent
        .filter((r) => r.agentId === agent.id)
        .map((r) => ({
          durationMs: r.durationMs,
          costUsd: this.container.priceBook.resolve(r.costUsd, r.model, r.tokensIn, r.tokensOut),
        }));
      return { agent_id: agent.id, ...meanEstimate(runs) };
    });
  }

  private toColumn(child: ChildRun, rv: RunReview | undefined): AgentColumn {
    const { run, agentName } = child;
    const status = (COLUMN_STATUSES as readonly (string | null)[]).includes(run.status)
      ? (run.status as AgentColumn['status'])
      : 'failed';
    return {
      run_id: run.id,
      agent_id: run.agentId,
      agent_name: agentName ?? DELETED_AGENT_NAME,
      provider: run.provider,
      model: run.model,
      status,
      error: run.error,
      verdict: rv?.review.verdict ?? null,
      score: rv?.review.score ?? run.score ?? null,
      summary: rv?.review.summary ?? null,
      duration_ms: run.durationMs,
      cost_usd: this.container.priceBook.resolve(run.costUsd, run.model, run.tokensIn, run.tokensOut),
      findings: (rv?.findings ?? []).map(findingRowToDto),
    };
  }
}
