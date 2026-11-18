import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';

export type MultiRunRow = typeof t.multiAgentRuns.$inferSelect;

export interface ChildRun {
  run: typeof t.agentRuns.$inferSelect;
  /** Joined agent name; null when the agent was deleted. */
  agentName: string | null;
}

export interface RecentMultiRunRow {
  multiRun: MultiRunRow;
  prNumber: number;
  prTitle: string;
}

export type SummaryChildRun = Pick<
  typeof t.agentRuns.$inferSelect,
  'multiRunId' | 'status' | 'durationMs' | 'costUsd' | 'model' | 'tokensIn' | 'tokensOut'
>;

export interface RunReview {
  review: typeof t.reviews.$inferSelect;
  findings: FindingRow[];
}

export interface RecentDoneRun {
  agentId: string;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  model: string | null;
}

/**
 * Multi-agent data access — the only layer touching the DB for this module.
 * Owns `multi_agent_runs` and the `agent_runs.multi_run_id` link; review and
 * finding rows are read-only here.
 */
export class MultiAgentRepository {
  constructor(private db: Db) {}

  /**
   * Insert the multi-run row and one `running` child `agent_runs` row per agent
   * in ONE transaction, so a failure leaves nothing behind. Child `ran_at` is
   * offset by 1 ms per index so the request order is a stable sort key.
   */
  async createMultiRun(
    workspaceId: string,
    prId: string,
    agents: { id: string; provider: string | null; model: string | null }[],
  ): Promise<{ multiRun: MultiRunRow; runIds: string[] }> {
    return this.db.transaction(async (tx) => {
      const [multiRun] = await tx.insert(t.multiAgentRuns).values({ workspaceId, prId }).returning();
      const base = multiRun!.ranAt.getTime();
      const runs = await tx
        .insert(t.agentRuns)
        .values(
          agents.map((a, i) => ({
            workspaceId,
            agentId: a.id,
            prId,
            provider: a.provider,
            model: a.model,
            status: 'running',
            source: 'local' as const,
            multiRunId: multiRun!.id,
            ranAt: new Date(base + i),
          })),
        )
        .returning({ id: t.agentRuns.id, ranAt: t.agentRuns.ranAt });
      runs.sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());
      return { multiRun: multiRun!, runIds: runs.map((r) => r.id) };
    });
  }

  async latestMultiRun(workspaceId: string, prId: string): Promise<MultiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(1);
    return row;
  }

  /** The repo's newest multi-runs (with their PR number/title), workspace-scoped. */
  async recentMultiRuns(workspaceId: string, repoId: string, limit: number): Promise<RecentMultiRunRow[]> {
    const rows = await this.db
      .select({ multiRun: t.multiAgentRuns, prNumber: t.pullRequests.number, prTitle: t.pullRequests.title })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(limit);
    return rows;
  }

  /** Child runs of several multi-runs in ONE query (no N+1). */
  async childRunsForMultiRuns(multiRunIds: string[]): Promise<SummaryChildRun[]> {
    if (multiRunIds.length === 0) return [];
    return this.db
      .select({
        multiRunId: t.agentRuns.multiRunId,
        status: t.agentRuns.status,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        model: t.agentRuns.model,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
      })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.multiRunId, multiRunIds));
  }

  async childRuns(multiRunId: string): Promise<ChildRun[]> {
    const rows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(eq(t.agentRuns.multiRunId, multiRunId))
      .orderBy(t.agentRuns.ranAt, t.agentRuns.id);
    return rows.map((r) => ({ run: r.run, agentName: r.agentName ?? null }));
  }

  /** Review + findings keyed by the producing run id. */
  async reviewsWithFindingsForRuns(
    runIds: string[],
  ): Promise<Map<string, RunReview>> {
    const out = new Map<string, RunReview>();
    if (runIds.length === 0) return out;
    const reviews = await this.db.select().from(t.reviews).where(inArray(t.reviews.runId, runIds));
    if (reviews.length === 0) return out;
    const findings = await this.db
      .select()
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviews.map((r) => r.id)));
    for (const review of reviews) {
      if (!review.runId) continue;
      out.set(review.runId, { review, findings: findings.filter((f) => f.reviewId === review.id) });
    }
    return out;
  }

  /** Last `limit` done runs per agent (newest first), for the estimates. */
  async recentDoneRunsPerAgent(workspaceId: string, limit = 5): Promise<RecentDoneRun[]> {
    const ranked = this.db
      .select({
        agentId: t.agentRuns.agentId,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        costUsd: t.agentRuns.costUsd,
        model: t.agentRuns.model,
        rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)`.as('rn'),
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          isNotNull(t.agentRuns.agentId),
        ),
      )
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rn, limit));
    return rows.map((r) => ({
      agentId: r.agentId as string,
      durationMs: r.durationMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: r.costUsd,
      model: r.model,
    }));
  }
}
