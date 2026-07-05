import type { IconName } from "@devdigest/ui";
import type { SkillType, SkillSource } from "@devdigest/shared";

/** Skill type -> chip colour (parallels AgentCard's MODEL_COLOR map). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--info)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Skill type -> representative icon for the card's icon chip. */
export const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "FileText",
  security: "Shield",
  custom: "Sparkles",
};

/** Skill source -> small icon shown on the source badge (mirrors the design). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "GitBranch",
  community: "Globe",
  imported_url: "Link",
};
