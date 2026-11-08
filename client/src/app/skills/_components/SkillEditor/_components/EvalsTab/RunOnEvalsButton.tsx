/* Header "Run on evals": starts a suite run with the selected host agent and jumps to the Evals tab.
   Disabled with a hint when no enabled agent can host (EC-30). */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { SkillEvalRunner } from "./useSkillEvalRunner";

export function RunOnEvalsButton({ runner, onStarted }: { runner: SkillEvalRunner; onStarted: () => void }) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const noHost = runner.hostId === null;
  return (
    <Button
      icon="Play"
      loading={runner.progress != null}
      disabled={noHost || runner.starting}
      title={noHost ? te("hostAgent.none") : undefined}
      onClick={() => {
        runner.start();
        onStarted();
      }}
    >
      {t("evals.runOnEvals")}
    </Button>
  );
}
