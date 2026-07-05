import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads (but does not
 * write) `agent_skills` — the agent side of that link table is owned by
 * `AgentsRepository` (`server/src/modules/agents/repository.ts`).
 * Workspace-scoped throughout.
 */

/** A skill row plus how many agents currently have it linked. */
export interface SkillWithAgentCount extends SkillRow {
  agentCount: number;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillStats {
  usedBy: number;
  agents: { id: string; name: string }[];
  findingsByCategory: { category: string; count: number }[];
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /** All skills in a workspace, each annotated with its linked-agent count. */
  async list(workspaceId: string): Promise<SkillWithAgentCount[]> {
    const rows = await this.db
      .select({
        skill: t.skills,
        agentCount: sql<number>`count(distinct ${t.agentSkills.agentId})`.mapWith(Number),
      })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id);
    return rows.map((r) => ({ ...r.skill, agentCount: r.agentCount }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Insert a skill AND record version 1 in skill_versions (immutable snapshot),
   * atomically — both rows commit together or not at all.
   */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source ?? 'manual',
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return row!;
    });
  }

  /**
   * Update a skill. Only a change to `body` bumps the version and snapshots
   * skill_versions — name/description/type/enabled patches update in place.
   *
   * The read → version-bump → update → snapshot sequence runs in one transaction
   * with the row `SELECT ... FOR UPDATE`-locked, so concurrent body edits
   * serialize into distinct, monotonic versions instead of racing to the same
   * version number (which previously lost a snapshot and diverged skills.body
   * from the latest skill_versions row).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body });
      }
      return row;
    });
  }

  /** Delete a skill (scoped to workspace). Versions + agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Usage stats for a skill: agents that currently link it (workspace-scoped),
   * and findings-by-category across those agents' reviews
   * (agent_skills → agents → reviews → findings).
   */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));

    const findingRows = await this.db
      .select({
        category: t.findings.category,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.reviews, eq(t.reviews.agentId, t.agents.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .groupBy(t.findings.category);

    return {
      usedBy: agentRows.length,
      agents: agentRows,
      findingsByCategory: findingRows,
    };
  }
}
