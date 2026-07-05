import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';
import type { ConventionExtractionCandidate } from './schemas.js';

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

/**
 * Conventions data-access. Owns `conventions`. Workspace-scoped throughout,
 * mirroring `skills/repository.ts`'s style.
 */

export interface UpdateConventionFields {
  status?: ConventionStatus;
  rule?: string;
  evidence_snippet?: string;
}

/** The repo fields `ConventionsService#extract` needs to call `container.git.readFile`. */
export interface ConventionsRepoRef {
  owner: string;
  name: string;
  clonePath: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Insert verified candidates as new `pending` rows. */
  async insertMany(
    workspaceId: string,
    repoId: string,
    candidates: ConventionExtractionCandidate[],
  ): Promise<ConventionRow[]> {
    if (candidates.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          rule: c.rule,
          category: c.category,
          evidencePath: c.evidence_path,
          evidenceLineStart: c.evidence_line_start,
          evidenceLineEnd: c.evidence_line_end,
          evidenceSnippet: c.evidence_snippet,
          confidence: c.confidence,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  /** All candidates for a repo, any status. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  /** Accept/reject/edit a single candidate. `undefined` when not found in this workspace. */
  async updateFields(
    workspaceId: string,
    id: string,
    patch: UpdateConventionFields,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidence_snippet !== undefined ? { evidenceSnippet: patch.evidence_snippet } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Delete `pending` rows for a repo ahead of a re-scan — accepted/rejected rows survive. */
  async deletePendingByRepo(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      );
  }

  /** owner/name/clonePath for `container.git.readFile` calls in `extract`'s config-file pass. */
  async getRepoRef(workspaceId: string, repoId: string): Promise<ConventionsRepoRef | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }
}
