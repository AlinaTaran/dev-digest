import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { EvalConfigSnapshot } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import type { EvalSkillRow } from './repository.js';

/** Frozen run config: persisted parts (`snapshot`) + in-memory skill bodies (AC-37). */
export interface RunConfig {
  snapshot: EvalConfigSnapshot;
  /** Prompt-ready bodies (imported skills wrapped as untrusted); NEVER persisted. */
  skillBodies: string[];
  agentVersion: number;
}

/** Snapshot the agent + its linked ENABLED skills at run start (AC-36/AC-37). */
export async function buildAgentRunConfig(container: Container, agent: AgentRow): Promise<RunConfig> {
  const linked = (await container.agentsRepo.linkedSkills(agent.id)).filter((l) => l.skill.enabled);
  return {
    agentVersion: agent.version,
    skillBodies: linked.map((l) =>
      l.skill.source === 'manual' ? l.skill.body : wrapUntrusted(`skill:${l.skill.name}`.replace(/["<>\r\n]/g, '_'), l.skill.body),
    ),
    snapshot: {
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      strategy: agent.strategy,
      skills: linked.map((l) => ({ id: l.skill.id, name: l.skill.name, version: l.skill.version })),
      agent_name: agent.name,
      skill_body: null,
    },
  };
}

/**
 * Snapshot a SKILL eval run (AC-80/81): the host agent's provider/model/prompt/strategy plus
 * ONLY the tested skill (wrapped as untrusted unless manual, EC-35). The host's own linked
 * skills are deliberately not loaded. Disabled skills stay runnable (EC-32).
 */
export function buildSkillRunConfig(host: AgentRow, skill: EvalSkillRow): RunConfig {
  const label = `skill:${skill.name}`.replace(/["<>\r\n]/g, '_');
  return {
    agentVersion: host.version,
    skillBodies: [skill.source === 'manual' ? skill.body : wrapUntrusted(label, skill.body)],
    snapshot: {
      provider: host.provider,
      model: host.model,
      system_prompt: host.systemPrompt,
      strategy: host.strategy,
      skills: [{ id: skill.id, name: skill.name, version: skill.version }],
      agent_name: host.name,
      skill_body: skill.body,
      skill_id: skill.id,
      skill_version: skill.version,
      skill_name: skill.name,
    },
  };
}
