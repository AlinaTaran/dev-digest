import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Onboarding, OnboardingErrorReason } from '@devdigest/shared';

/**
 * Onboarding data-access. Owns the `onboarding` row (1:1 with a repo) and the
 * workspace-scoped repo lookup the service resolves before any facade call.
 */

export interface OnboardingRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
  defaultBranch: string;
}

export type OnboardingRow = typeof t.onboarding.$inferSelect;

export interface FinishPatch {
  status: 'done' | 'failed';
  error?: OnboardingErrorReason;
  /** Stored only on success paths; a failure that keeps the old tour omits it. */
  tour?: Onboarding;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped: another workspace's repo id resolves to `null` (IDOR). */
  async getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRow | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row ?? null;
  }

  async getRow(repoId: string): Promise<OnboardingRow | null> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row ?? null;
  }

  /**
   * Atomic single-flight claim (AC-13): insert, or take over the row only when
   * no generation is in flight. The previous tour (`json`) is left untouched.
   * `null` means another generation is already running.
   */
  async claimGeneration(repoId: string, generationId: string, now: Date): Promise<OnboardingRow | null> {
    const claim = {
      generationId,
      generationStatus: 'generating',
      generationStartedAt: now,
      generationFinishedAt: null,
      generationError: null,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(t.onboarding)
      .values({ repoId, ...claim })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: claim,
        setWhere: sql`${t.onboarding.generationStatus} IS DISTINCT FROM 'generating'`,
      })
      .returning();
    return row ?? null;
  }

  /** Terminal write, conditional on this generation still being the in-flight one. */
  async finishGeneration(repoId: string, generationId: string, patch: FinishPatch): Promise<boolean> {
    const now = new Date();
    const set: Partial<typeof t.onboarding.$inferInsert> = {
      generationStatus: patch.status,
      generationFinishedAt: now,
      generationError: patch.status === 'failed' ? (patch.error ?? 'internal') : null,
      updatedAt: now,
    };
    if (patch.tour) {
      set.json = patch.tour;
      set.generatedAt = new Date(patch.tour.generated_at);
    }
    const rows = await this.db
      .update(t.onboarding)
      .set(set)
      .where(
        and(
          eq(t.onboarding.repoId, repoId),
          eq(t.onboarding.generationId, generationId),
          eq(t.onboarding.generationStatus, 'generating'),
        ),
      )
      .returning({ repoId: t.onboarding.repoId });
    return rows.length > 0;
  }

  /** `generating` rows that started before `olderThan` become `failed/timeout`. */
  async expireOverdue(repoId: string, olderThan: Date): Promise<boolean> {
    const now = new Date();
    const rows = await this.db
      .update(t.onboarding)
      .set({
        generationStatus: 'failed',
        generationError: 'timeout',
        generationFinishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(t.onboarding.repoId, repoId),
          eq(t.onboarding.generationStatus, 'generating'),
          lt(t.onboarding.generationStartedAt, olderThan),
        ),
      )
      .returning({ repoId: t.onboarding.repoId });
    return rows.length > 0;
  }

  /** Boot reaper (AC-15): every `generating` row belongs to a dead process. */
  async reapGenerating(): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .update(t.onboarding)
      .set({
        generationStatus: 'failed',
        generationError: 'interrupted',
        generationFinishedAt: now,
        updatedAt: now,
      })
      .where(eq(t.onboarding.generationStatus, 'generating'))
      .returning({ repoId: t.onboarding.repoId });
    return rows.length;
  }
}
