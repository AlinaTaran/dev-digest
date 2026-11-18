import { and, asc, desc, eq, or, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow } from '../../db/rows.js';
import type { CiRun, Verdict } from '@devdigest/shared';

export interface ConnectedRepo {
  id: string;
  defaultBranch: string;
}

export interface InstallationUpsert {
  agentId: string;
  repo: string;
  workflowFile: string;
  runnerVersion: string;
  prUrl: string | null;
}

export interface InstallationWithAgent {
  installation: CiInstallationRow;
  agentName: string;
}

/** One accepted CI result, ready to persist (already validated by the service). */
export interface IngestRecord {
  workspaceId: string;
  installation: CiInstallationRow;
  workflowRunId: number;
  runAttempt: number;
  ranAt: Date;
  githubUrl: string;
  prNumber: number;
  status: 'succeeded' | 'no_findings' | 'failed' | 'skipped';
  reason: string | null;
  verdict: Verdict | null;
  model: string;
  durationMs: number | null;
  costUsd: number | null;
  findingsCount: number;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  blockers: number;
}

/** Thrown inside the ingest transaction to roll back `agent_runs` when `ci_runs` is a duplicate. */
export class DuplicateCiRun extends Error {
  constructor() {
    super('CI run already ingested');
    this.name = 'DuplicateCiRun';
  }
}

const AGENT_RUN_STATUS = {
  succeeded: 'done',
  no_findings: 'done',
  failed: 'failed',
  skipped: 'skipped',
} as const;

/** All Drizzle access for the `ci` module. Workspace-scoped throughout. */
export class CiRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, fullName: string): Promise<ConnectedRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, defaultBranch: t.repos.defaultBranch })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }

  /** Workspace-wide memory plus this repo's own, oldest first. */
  async memoryFor(workspaceId: string, repoId: string) {
    return this.db
      .select({ kind: t.memory.kind, scope: t.memory.scope, content: t.memory.content })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          or(
            eq(t.memory.scope, 'global'),
            and(eq(t.memory.scope, 'repo'), eq(t.memory.repoId, repoId)),
          ),
        ),
      )
      .orderBy(asc(t.memory.createdAt));
  }

  async upsertInstallation(v: InstallationUpsert): Promise<CiInstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: v.agentId,
        repo: v.repo,
        targetType: 'gha',
        workflowFile: v.workflowFile,
        runnerVersion: v.runnerVersion,
        prUrl: v.prUrl,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set: {
          workflowFile: v.workflowFile,
          runnerVersion: v.runnerVersion,
          prUrl: v.prUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async installationsForAgent(agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(asc(t.ciInstallations.installedAt));
  }

  async installationsForWorkspace(workspaceId: string): Promise<InstallationWithAgent[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.ciInstallations.installedAt));
    return rows;
  }

  /** `"<workflowRunId>:<attempt>"` of every run already stored for an installation. */
  async knownRuns(installationId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: t.ciRuns.workflowRunId, attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(eq(t.ciRuns.ciInstallationId, installationId));
    return new Set(rows.map((r) => `${r.id}:${r.attempt}`));
  }

  /**
   * Persist one accepted result: `agent_runs` (source='ci', no PR) + `ci_runs` in ONE
   * transaction. A duplicate `ci_runs` key throws {@link DuplicateCiRun} so the
   * `agent_runs` insert rolls back too.
   */
  async ingest(r: IngestRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: r.workspaceId,
          agentId: r.installation.agentId,
          prId: null,
          source: 'ci',
          provider: 'openrouter',
          model: r.model,
          ranAt: r.ranAt,
          durationMs: r.durationMs,
          costUsd: r.costUsd,
          findingsCount: r.findingsCount,
          blockers: r.blockers,
          status: AGENT_RUN_STATUS[r.status],
          error: r.reason,
        })
        .returning({ id: t.agentRuns.id });

      const inserted = await tx
        .insert(t.ciRuns)
        .values({
          ciInstallationId: r.installation.id,
          agentRunId: run!.id,
          workflowRunId: r.workflowRunId,
          runAttempt: r.runAttempt,
          repo: r.installation.repo,
          prNumber: r.prNumber,
          ranAt: r.ranAt,
          status: r.status,
          verdict: r.verdict,
          findingsCount: r.findingsCount,
          critical: r.critical,
          warning: r.warning,
          suggestion: r.suggestion,
          costUsd: r.costUsd,
          githubUrl: r.githubUrl,
          source: 'ci',
        })
        .onConflictDoNothing({
          target: [t.ciRuns.ciInstallationId, t.ciRuns.workflowRunId, t.ciRuns.runAttempt],
        })
        .returning({ id: t.ciRuns.id });
      if (inserted.length === 0) throw new DuplicateCiRun();
    });
  }

  /** Last 10 runs per installation, newest first. */
  async recentRunsByInstallation(installationIds: string[]): Promise<Map<string, CiRun[]>> {
    const entries = await Promise.all(
      installationIds.map(async (id) => [id, await this.selectRuns(eq(t.ciRuns.ciInstallationId, id), 10)] as const),
    );
    return new Map(entries);
  }

  /** Newest CI runs of the workspace. */
  async listRuns(workspaceId: string, limit: number): Promise<CiRun[]> {
    return this.selectRuns(eq(t.agentRuns.workspaceId, workspaceId), limit);
  }

  private async selectRuns(where: SQL, limit: number): Promise<CiRun[]> {
    const rows = await this.db
      .select({
        run: t.ciRuns,
        agentId: t.ciInstallations.agentId,
        agentName: t.agents.name,
        durationMs: t.agentRuns.durationMs,
      })
      .from(t.ciRuns)
      .leftJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(where)
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(limit);
    return rows.map(({ run, agentId, agentName, durationMs }) => ({
      id: run.id,
      ci_installation_id: run.ciInstallationId,
      repo: run.repo,
      agent_id: agentId,
      pr_number: run.prNumber,
      ran_at: run.ranAt ? run.ranAt.toISOString() : null,
      status: run.status,
      verdict: run.verdict as Verdict | null,
      findings_count: run.findingsCount,
      critical: run.critical,
      warning: run.warning,
      suggestion: run.suggestion,
      run_attempt: run.runAttempt,
      cost_usd: run.costUsd,
      github_url: run.githubUrl,
      source: run.source,
      agent: agentName,
      duration_s: durationMs == null ? null : durationMs / 1000,
    }));
  }
}
