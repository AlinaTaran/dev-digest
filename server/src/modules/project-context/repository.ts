import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_PROJECT_CONTEXT_GLOBS, type ContextDocUsedBy } from '@devdigest/shared';
import { validateGlobs } from './paths.js';
import type { LinkedSkillDocs } from './effective.js';

export interface ContextRepo {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

/**
 * Project-context data access. Owns `agent_context_docs` / `skill_context_docs`;
 * reads agents, skills, agent_skills, repos and settings. Workspace-scoped lookups
 * return `undefined` for foreign ids (callers map that to 404).
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getAgent(workspaceId: string, agentId: string): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  /** Enabled agents of the workspace, oldest first (id breaks ties). */
  async enabledAgentIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
    return rows.map((r) => r.id);
  }

  async getSkill(workspaceId: string, skillId: string): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }

  /** Effective search globs; falls back to the default when the row is missing/invalid. */
  async getGlobs(workspaceId: string): Promise<string[]> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'project_context_globs')))
      .limit(1);
    const v = row?.value;
    if (Array.isArray(v) && v.length > 0 && v.every((g) => typeof g === 'string') && validateGlobs(v) === null) {
      return v as string[];
    }
    return [...DEFAULT_PROJECT_CONTEXT_GLOBS];
  }

  async agentPaths(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async skillPaths(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  /** Serialize concurrent replace-sets for one owner+repo (released at txn end). */
  private async lockOwner(tx: Pick<Db, 'execute'>, ownerId: string, repoId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}), hashtext(${repoId}))`);
  }

  /** Full ordered replace (one txn). Never touches agent/skill `version`. */
  async replaceAgentPaths(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockOwner(tx, agentId, repoId);
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId, repoId, path, position })));
      }
    });
  }

  async replaceSkillPaths(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockOwner(tx, skillId, repoId);
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, position) => ({ skillId, repoId, path, position })));
      }
    });
  }

  /** Skills linked to the agent (link order), each with its saved paths for the repo. */
  async linkedSkillDocs(agentId: string, repoId: string): Promise<LinkedSkillDocs[]> {
    const links = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        enabled: t.skills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    const out: LinkedSkillDocs[] = [];
    for (const l of links) {
      out.push({ ...l, paths: await this.skillPaths(l.skillId, repoId) });
    }
    return out;
  }

  /**
   * path -> distinct agents using it in this repo: attached directly, or via an
   * ENABLED linked skill. An agent counts once per path (direct wins over skill).
   */
  async usedByForRepo(workspaceId: string, repoId: string): Promise<Map<string, ContextDocUsedBy[]>> {
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agents.id, agentName: t.agents.name })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agentContextDocs.repoId, repoId), eq(t.agents.workspaceId, workspaceId)));
    const viaSkill = await this.db
      .select({
        path: t.skillContextDocs.path,
        agentId: t.agents.id,
        agentName: t.agents.name,
        skillName: t.skills.name,
      })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.skillContextDocs.repoId, repoId),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      );

    const map = new Map<string, ContextDocUsedBy[]>();
    const seen = new Set<string>();
    const add = (path: string, u: ContextDocUsedBy) => {
      const key = `${path}\u0000${u.agent_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const list = map.get(path) ?? [];
      list.push(u);
      map.set(path, list);
    };
    for (const r of direct) add(r.path, { agent_id: r.agentId, agent_name: r.agentName, via: 'agent' });
    for (const r of viaSkill) {
      add(r.path, { agent_id: r.agentId, agent_name: r.agentName, via: 'skill', skill_name: r.skillName });
    }
    return map;
  }
}
