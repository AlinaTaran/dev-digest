import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  EvalCaseActualOutput,
  EvalCaseError,
  EvalCaseMeta,
  EvalConfigSnapshot,
  EvalExpectation,
  EvalInputFile,
  EvalOwnerKind,
  EvalRun,
  EvalSuiteRunStatus,
} from '@devdigest/shared';

/**
 * Eval data-access. The ONLY layer touching the DB for the eval domain: `eval_cases`,
 * `eval_suite_runs` (one row per eval run) and `eval_runs` (one row per executed case).
 * Everything is workspace-scoped; `eval_cases.owner_id` is polymorphic (agent|skill, no FK).
 */

export type EvalSkillRow = typeof t.skills.$inferSelect;
export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalSuiteRunRow = typeof t.evalSuiteRuns.$inferSelect;
export type EvalResultRow = typeof t.evalRuns.$inferSelect & { caseName: string; caseExpected: unknown };

export interface NewEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: EvalInputFile[];
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation[];
  notes: string | null;
  sourceFindingId?: string | null;
}

export interface EvalCasePatch {
  name?: string;
  inputDiff?: string;
  inputFiles?: EvalInputFile[];
  inputMeta?: EvalCaseMeta;
  expectedOutput?: EvalExpectation[];
  notes?: string | null;
}

export interface NewEvalResult {
  caseId: string;
  suiteRunId: string | null;
  actualOutput: EvalCaseActualOutput;
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  error: EvalCaseError | null;
}

export interface NewSuiteRun {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  ownerVersion: number;
  agentId: string | null;
  agentVersion: number;
  casesTotal: number;
  configSnapshot: EvalConfigSnapshot;
  caseIds: string[];
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- skill owners (read-only; the skills module owns writes) -------------

  async getSkill(workspaceId: string, id: string): Promise<EvalSkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  // ---- cases --------------------------------------------------------------

  listCases(workspaceId: string, kind: EvalOwnerKind, ownerId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, kind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.name), asc(t.evalCases.id));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async caseNames(workspaceId: string, kind: EvalOwnerKind, ownerId: string): Promise<string[]> {
    const rows = await this.listCases(workspaceId, kind, ownerId);
    return rows.map((r) => r.name);
  }

  async insertCase(values: NewEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db.insert(t.evalCases).values(values).returning();
    return row!;
  }

  /**
   * Idempotent insert keyed by `(owner_kind, owner_id, source_finding_id)` (D6): the unique
   * index makes concurrent double clicks produce ONE case; the loser re-selects the winner.
   */
  async insertCaseFromFinding(
    values: NewEvalCase & { sourceFindingId: string },
  ): Promise<{ row: EvalCaseRow; created: boolean }> {
    const inserted = await this.db
      .insert(t.evalCases)
      .values(values)
      .onConflictDoNothing({
        target: [t.evalCases.ownerKind, t.evalCases.ownerId, t.evalCases.sourceFindingId],
      })
      .returning();
    if (inserted[0]) return { row: inserted[0], created: true };
    const [existing] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, values.workspaceId),
          eq(t.evalCases.ownerKind, values.ownerKind),
          eq(t.evalCases.ownerId, values.ownerId),
          eq(t.evalCases.sourceFindingId, values.sourceFindingId),
        ),
      );
    return { row: existing!, created: false };
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: EvalCasePatch,
  ): Promise<EvalCaseRow | undefined> {
    if (Object.keys(patch).length === 0) return this.getCase(workspaceId, id);
    const [row] = await this.db
      .update(t.evalCases)
      .set(patch)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /** Results cascade via FK; finished suite runs keep their aggregated metrics (AC-26). */
  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** D11: called by Agents/SkillsService.delete. Cases -> results cascade; suite runs go too. */
  async deleteByOwner(workspaceId: string, kind: EvalOwnerKind, ownerId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.evalSuiteRuns)
        .where(
          and(
            eq(t.evalSuiteRuns.workspaceId, workspaceId),
            eq(t.evalSuiteRuns.ownerKind, kind),
            eq(t.evalSuiteRuns.ownerId, ownerId),
          ),
        );
      await tx
        .delete(t.evalCases)
        .where(
          and(
            eq(t.evalCases.workspaceId, workspaceId),
            eq(t.evalCases.ownerKind, kind),
            eq(t.evalCases.ownerId, ownerId),
          ),
        );
    });
  }

  // ---- case results -------------------------------------------------------

  async insertResult(values: NewEvalResult): Promise<EvalResultRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    const [c] = await this.db
      .select({ name: t.evalCases.name, expected: t.evalCases.expectedOutput })
      .from(t.evalCases)
      .where(eq(t.evalCases.id, values.caseId));
    return { ...row!, caseName: c?.name ?? '', caseExpected: c?.expected ?? [] };
  }

  /** Latest result per case (any run, incl. single-case runs), one query (no N+1). */
  async lastResults(caseIds: string[]): Promise<Map<string, EvalResultRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId], { run: t.evalRuns, caseName: t.evalCases.name, caseExpected: t.evalCases.expectedOutput })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
    return new Map(rows.map((r) => [r.run.caseId, { ...r.run, caseName: r.caseName, caseExpected: r.caseExpected }]));
  }

  async listResults(suiteRunId: string): Promise<EvalResultRow[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name, caseExpected: t.evalCases.expectedOutput })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.suiteRunId, suiteRunId))
      .orderBy(asc(t.evalCases.name), asc(t.evalRuns.id));
    return rows.map((r) => ({ ...r.run, caseName: r.caseName, caseExpected: r.caseExpected }));
  }

  // ---- suite runs ---------------------------------------------------------

  /**
   * Insert a `running` suite run. The partial unique index (one `running` per owner, D7) makes
   * the insert a no-op when one is active -> `{conflict: activeRunId}` (AC-39).
   */
  async createSuiteRun(
    values: NewSuiteRun,
  ): Promise<{ run: EvalSuiteRunRow } | { conflict: string | null }> {
    const inserted = await this.db
      .insert(t.evalSuiteRuns)
      .values({ ...values, status: 'running' })
      .onConflictDoNothing({
        target: [t.evalSuiteRuns.ownerKind, t.evalSuiteRuns.ownerId],
        where: sql`${t.evalSuiteRuns.status} = 'running'`,
      })
      .returning();
    if (inserted[0]) return { run: inserted[0] };
    const [active] = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.ownerKind, values.ownerKind),
          eq(t.evalSuiteRuns.ownerId, values.ownerId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return { conflict: active?.id ?? null };
  }

  async incrementCasesDone(runId: string, errored: boolean): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({
        casesDone: sql`${t.evalSuiteRuns.casesDone} + 1`,
        ...(errored ? { casesErrored: sql`${t.evalSuiteRuns.casesErrored} + 1` } : {}),
      })
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')));
  }

  /** Terminal write; only moves a still-`running` row (so a reaped row is never overwritten). */
  async finishSuiteRun(
    runId: string,
    values: {
      status: Exclude<EvalSuiteRunStatus, 'running'>;
      metrics: EvalRun | null;
      casesErrored: number;
      errorReason?: string | null;
    },
  ): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: values.status,
        metrics: values.metrics,
        casesErrored: values.casesErrored,
        errorReason: values.errorReason ?? null,
        finishedAt: new Date(),
      })
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  async getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  listSuiteRuns(
    workspaceId: string,
    kind: EvalOwnerKind,
    ownerId: string,
    sinceDays: number,
  ): Promise<EvalSuiteRunRow[]> {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, kind),
          eq(t.evalSuiteRuns.ownerId, ownerId),
          gte(t.evalSuiteRuns.startedAt, since),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
  }

  // ---- dashboards (DB-only, one query each; no N+1) -------------------------

  /** Case count per agent owner of a workspace (agents without cases are absent). */
  async agentCaseCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.n]));
  }

  /** Latest finished (done|partial) agent run per agent. */
  async lastFinishedAgentRuns(workspaceId: string): Promise<Map<string, EvalSuiteRunRow>> {
    const rows = await this.db
      .selectDistinctOn([t.evalSuiteRuns.ownerId])
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          inArray(t.evalSuiteRuns.status, ['done', 'partial']),
        ),
      )
      .orderBy(t.evalSuiteRuns.ownerId, desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
    return new Map(rows.map((r) => [r.ownerId, r]));
  }

  /** Last `limit` finished recalls per agent, oldest first. */
  async recentRecalls(workspaceId: string, limit: number): Promise<Map<string, number[]>> {
    const sub = this.db
      .select({
        ownerId: t.evalSuiteRuns.ownerId,
        startedAt: t.evalSuiteRuns.startedAt,
        recall: sql<string | null>`${t.evalSuiteRuns.metrics}->>'recall'`.as('recall'),
        rn: sql<number>`row_number() over (partition by ${t.evalSuiteRuns.ownerId} order by ${t.evalSuiteRuns.startedAt} desc, ${t.evalSuiteRuns.id} desc)`.as(
          'rn',
        ),
      })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          inArray(t.evalSuiteRuns.status, ['done', 'partial']),
        ),
      )
      .as('s');
    const rows = await this.db
      .select()
      .from(sub)
      .where(lte(sub.rn, limit))
      .orderBy(asc(sub.ownerId), asc(sub.startedAt));
    const out = new Map<string, number[]>();
    for (const r of rows) {
      if (r.recall === null) continue;
      const list = out.get(r.ownerId) ?? [];
      list.push(Number(r.recall));
      out.set(r.ownerId, list);
    }
    return out;
  }

  /** Most recent finished-or-partial agent runs across the workspace (AC-62, AC-86). */
  recentFinishedAgentRuns(workspaceId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          inArray(t.evalSuiteRuns.status, ['done', 'partial']),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  /** D10: boot reaper. `running` -> `partial` if any case finished, else `failed`. */
  async reapRunning(): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: sql`CASE WHEN ${t.evalSuiteRuns.casesDone} > 0 THEN 'partial' ELSE 'failed' END`,
        errorReason: 'interrupted',
        finishedAt: new Date(),
      })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }
}
