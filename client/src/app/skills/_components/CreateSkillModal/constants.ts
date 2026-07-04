import type { SkillType } from "@devdigest/shared";

/** Default type for a new from-scratch skill. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Selectable types in the create form (same order as the Skill contract enum). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;
