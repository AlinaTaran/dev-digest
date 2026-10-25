export interface LinkedSkillDocs {
  skillId: string;
  skillName: string;
  enabled: boolean;
  /** Saved order of this skill's attached paths for the repo. */
  paths: readonly string[];
}

export type EffectiveSource = 'agent' | { skill_id: string; skill_name: string };

export interface EffectiveDoc {
  path: string;
  source: EffectiveSource;
}

/**
 * AC-34–36: agent's own paths in saved order, then each ENABLED linked skill (in
 * link order) with its saved order. Duplicates drop, keeping the first occurrence
 * and its source.
 */
export function resolveEffective(
  agentPaths: readonly string[],
  linkedSkills: readonly LinkedSkillDocs[],
): EffectiveDoc[] {
  const seen = new Set<string>();
  const out: EffectiveDoc[] = [];
  const push = (path: string, source: EffectiveSource) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, source });
  };
  for (const p of agentPaths) push(p, 'agent');
  for (const s of linkedSkills) {
    if (!s.enabled) continue;
    for (const p of s.paths) push(p, { skill_id: s.skillId, skill_name: s.skillName });
  }
  return out;
}
