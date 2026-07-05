import type { Skill, SkillType, SkillSource } from "@devdigest/shared";
import { TYPE_COLOR, TYPE_ICON, SOURCE_ICON } from "./constants";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills<T extends Skill>(skills: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}

/** Resolve the chip colour for a skill's type. */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type];
}

/** Resolve the icon for a skill's type. */
export function typeIcon(type: SkillType) {
  return TYPE_ICON[type];
}

/** Resolve the icon for a skill's source. */
export function sourceIcon(source: SkillSource) {
  return SOURCE_ICON[source];
}
