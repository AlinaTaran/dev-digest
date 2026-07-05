import type { Skill } from "@devdigest/shared";

/** Rough token estimate for a skill's body — same ~4 chars/token convention as
 *  RunTraceDrawer/helpers.ts's estimateTokenCount (colocated here to avoid a
 *  cross-feature import from the pulls feature into the agents feature). */
export function estimateSkillTokens(skill: Pick<Skill, "body">): number {
  return Math.round(skill.body.length / 4);
}

/** Move the item at `from` to `to` within an array, returning a new array
 *  (used to compute the reordered skill_ids list on drop). */
export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items.slice();
  }
  const next = items.slice();
  // Bounds already validated above, so this element always exists.
  const moved = next.splice(from, 1)[0]!;
  next.splice(to, 0, moved);
  return next;
}
