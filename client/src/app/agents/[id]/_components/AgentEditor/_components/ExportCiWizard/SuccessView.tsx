"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { WizardResult } from "./useExportCiWizard";
import { SECRET_KEY } from "./constants";
import { s } from "./styles";

/** Only link to GitHub — never render a server-supplied URL with another scheme. */
function safePrUrl(url: string | null): string | null {
  return url && url.startsWith("https://github.com/") ? url : null;
}

export function SuccessView({ result, repo }: { result: WizardResult; repo: string }) {
  const t = useTranslations("ci");
  const prUrl = result.kind === "pr" ? safePrUrl(result.prUrl) : null;
  return (
    <div style={s.success}>
      <Icon.CheckCircle size={28} style={{ color: "var(--ok)" }} />
      <div style={s.cardTitle}>
        {result.kind === "pr" ? t("exportWizard.success.prTitle") : t("exportWizard.success.zipTitle")}
      </div>
      <div style={s.cardDesc}>
        {result.kind === "pr"
          ? t("exportWizard.success.prBody", { repo })
          : t("exportWizard.success.zipBody", { repo })}
      </div>
      {prUrl && (
        <a href={prUrl} target="_blank" rel="noreferrer" style={s.link}>
          {t("exportWizard.success.openPr")}
        </a>
      )}
      <div style={s.info}>{t("exportWizard.success.secretReminder", { key: SECRET_KEY })}</div>
    </div>
  );
}
