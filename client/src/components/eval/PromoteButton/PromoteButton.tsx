/* "Promote vB" for the Compare modal footer (AC-54): applies the newer run's snapshot
   (provider, model, system prompt, strategy) to the agent via useUpdateAgent. Renders nothing
   when the snapshot already equals the current config. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Agent, EvalSuiteRun } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { promotePatch } from "@/lib/eval/promote";
import { orderRuns } from "@/lib/eval/compare";

export interface PromoteButtonProps {
  /** The agent's current config. */
  agent: Agent;
  /** The two runs being compared; the newer one (by started_at) is promoted. */
  a: EvalSuiteRun;
  b: EvalSuiteRun;
}

export function PromoteButton({ agent, a, b }: PromoteButtonProps) {
  const t = useTranslations("eval");
  const update = useUpdateAgent();
  const [done, setDone] = useState(false);
  const newer = orderRuns(a, b)[1];
  const patch = promotePatch(newer, agent);
  const version = newer.owner_version;

  if (done) {
    return (
      <span role="status" style={{ fontSize: 13, color: "var(--ok)" }}>
        {t("compareModal.promoted", { b: version })}
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
      onClick={() => update.mutate({ id: agent.id, patch }, { onSuccess: () => setDone(true) })}
    >
      {update.isPending ? t("compareModal.promoting") : t("compareModal.promote", { b: version })}
    </Button>
  );
}
