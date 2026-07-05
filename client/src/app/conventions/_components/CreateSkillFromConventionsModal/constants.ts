import type { SkillType } from "@devdigest/shared";

/** Modal width (px) — same as skills' CreateSkillModal. */
export const MODAL_WIDTH = 640;

/** Same `SkillType` set as skills' CreateSkillModal; this modal defaults to
    'convention' since the body is always extracted conventions, but stays
    editable in case a candidate is really a security/rubric rule in disguise. */
export const TYPE_VALUES: SkillType[] = ["convention", "rubric", "security", "custom"];
export const DEFAULT_TYPE: SkillType = "convention";
