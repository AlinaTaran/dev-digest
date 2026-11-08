/* eval/promote.ts — what "Promote vB" would change on the agent (AC-54). */
import type { Agent, EvalSuiteRun } from "@devdigest/shared";

export type PromotePatch = Pick<Agent, "provider" | "model" | "system_prompt" | "strategy">;

/** The snapshot's agent config as a patch, or null when it already equals the current agent. */
export function promotePatch(
  newer: EvalSuiteRun,
  current: Pick<Agent, "provider" | "model" | "system_prompt" | "strategy">,
): PromotePatch | null {
  const snap = newer.config_snapshot;
  const same =
    snap.provider === current.provider &&
    snap.model === current.model &&
    snap.system_prompt === current.system_prompt &&
    snap.strategy === current.strategy;
  if (same) return null;
  return {
    provider: snap.provider as Agent["provider"],
    model: snap.model,
    system_prompt: snap.system_prompt,
    strategy: snap.strategy as Agent["strategy"],
  };
}

/** The tested skill body as a patch, or null when it already equals the current skill body (or the run has none). */
export function skillPromotePatch(newer: EvalSuiteRun, current: { body: string }): { body: string } | null {
  const body = newer.config_snapshot.skill_body;
  if (body == null || body === current.body) return null;
  return { body };
}
