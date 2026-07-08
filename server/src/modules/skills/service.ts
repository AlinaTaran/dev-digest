import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository, type SkillStats } from './repository.js';
import { extractSkillCore, toSkillDto, toSkillVersionDto, type SkillVersionDto } from './helpers.js';

/**
 * Skills service. Business logic for the Skills lab: reusable Markdown
 * instruction blocks, versioned on body change, attached (in order) to
 * agents via `agent_skills` (owned by the agents module).
 */

export interface SkillWithAgentCount extends Skill {
  agent_count: number;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillStatsDto {
  used_by: number;
  agents: { id: string; name: string }[];
  findings_by_category: { category: string; count: number }[];
}

/** Unsaved preview returned by `POST /skills/import` — no id/enabled/version yet. */
export interface ImportedSkillPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: 'extracted';
  ignored: string[];
}

function toStatsDto(stats: SkillStats): SkillStatsDto {
  return {
    used_by: stats.usedBy,
    agents: stats.agents,
    findings_by_category: stats.findingsByCategory,
  };
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillWithAgentCount[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map((row) => ({ ...toSkillDto(row), agent_count: row.agentCount }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Create a skill. `source` defaults to `'manual'`; `enabled` defaults to
   * `true` when the (defaulted) source is `'manual'`, `false` otherwise —
   * imported/community skills start disabled pending vetting.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const enabled = input.enabled ?? source === 'manual';
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source,
      enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Version history for a skill, newest first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (route → 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore a past body snapshot as the skill's current body. This does NOT
   * mutate history — it re-applies the old body through `update`, so the
   * body-change-bumps-version rule records it as a fresh version on top.
   * Returns undefined (route → 404) when the skill isn't in this workspace or
   * the requested version was never recorded.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(skillId, version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(workspaceId, skillId, { body: snapshot.body });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Usage stats for a skill (linked agents + findings-by-category). Returns
   * undefined when the skill isn't in this workspace (route → 404).
   */
  async stats(workspaceId: string, skillId: string): Promise<SkillStatsDto | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const stats = await this.repo.stats(workspaceId, skillId);
    return toStatsDto(stats);
  }

  /**
   * Extract a skill's core fields from an uploaded `.md`/`.zip` file. Pure
   * preview — nothing is persisted here; the client confirms via `POST /skills`.
   * A malformed/oversized upload is a client fault → surfaces as 422, not a 500.
   */
  importFromFile(filename: string, contentBase64: string): ImportedSkillPreview {
    const buf = Buffer.from(contentBase64, 'base64');
    let core;
    try {
      core = extractSkillCore(filename, buf);
    } catch (err) {
      throw new ValidationError(
        `Could not read skill from "${filename}": ${err instanceof Error ? err.message : 'invalid file'}`,
      );
    }
    return {
      name: core.name,
      description: core.description,
      type: core.type,
      body: core.body,
      source: 'extracted',
      ignored: core.ignored,
    };
  }
}
