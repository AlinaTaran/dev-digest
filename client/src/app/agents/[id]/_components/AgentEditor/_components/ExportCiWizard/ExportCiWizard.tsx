/* ExportCiWizard — Target → Preview → Configure → Install modal that exports an agent to
   GitHub Actions (PR from `devdigest/ci`, or a zip). State lives in useExportCiWizard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useExportCiWizard } from "./useExportCiWizard";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { SuccessView } from "./SuccessView";
import { LAST_STEP, STEP_KEYS } from "./constants";
import { s } from "./styles";

export function ExportCiWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const w = useExportCiWizard(agent);
  const { step, result } = w.state;
  const labels = STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`));

  const footer = result ? (
    <div style={s.footer}>
      <span style={s.spacer} />
      <Button kind="primary" onClick={onClose}>
        {t("exportWizard.done")}
      </Button>
    </div>
  ) : (
    <div style={s.footer}>
      {step > 0 && (
        <Button kind="secondary" icon="ChevronLeft" onClick={w.back} disabled={w.installing}>
          {t("exportWizard.back")}
        </Button>
      )}
      <span style={s.spacer} />
      {step < LAST_STEP ? (
        <Button kind="primary" iconRight="ArrowRight" onClick={w.next} disabled={!w.canContinue}>
          {t("exportWizard.continue")}
        </Button>
      ) : (
        <Button kind="primary" icon="Check" onClick={w.install} disabled={w.installing || w.preview.data == null}>
          {w.installing ? t("exportWizard.installing") : t("exportWizard.install")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      width={860}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      {!result && (
        <div style={s.stepper}>
          <ExportWizardSteps step={step} labels={labels} />
        </div>
      )}
      <div style={s.body}>
        {result ? (
          <SuccessView result={result} repo={w.repo} />
        ) : step === 0 ? (
          <TargetStep w={w} />
        ) : step === 1 ? (
          <PreviewStep w={w} />
        ) : step === 2 ? (
          <ConfigureStep w={w} />
        ) : (
          <InstallStep w={w} />
        )}
      </div>
    </Modal>
  );
}
