/* "Promote vB" for the skill Compare modal: applies the newer run's tested skill body to the
   skill via useUpdateSkill (PUT /skills/:id). Renders nothing when the body already equals the current one. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalSuiteRun, Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { skillPromotePatch } from "@/lib/eval/promote";
import { orderRuns } from "@/lib/eval/compare";

export interface SkillPromoteButtonProps {
  /** The skill's current state. */
  skill: Pick<Skill, "id" | "body">;
  /** The two runs being compared; the newer one (by started_at) is promoted. */
  a: EvalSuiteRun;
  b: EvalSuiteRun;
}

export function SkillPromoteButton({ skill, a, b }: SkillPromoteButtonProps) {
  const t = useTranslations("eval");
  const update = useUpdateSkill();
  const [done, setDone] = useState(false);
  const newer = orderRuns(a, b)[1];
  const patch = skillPromotePatch(newer, skill);
  const version = newer.owner_version;

  if (done) {
    return (
      <span role="status" style={{ fontSize: 13, color: "var(--ok)" }}>
        {t("compareModal.skillPromoted", { b: version })}
      </span>
    );
  }
  if (!patch) return null;

  return (
    <Button
      kind="primary"
      icon="GitBranch"
      loading={update.isPending}
      disabled={update.isPending}
      onClick={() => update.mutate({ id: skill.id, patch }, { onSuccess: () => setDone(true) })}
    >
      {update.isPending ? t("compareModal.promoting") : t("compareModal.promote", { b: version })}
    </Button>
  );
}
