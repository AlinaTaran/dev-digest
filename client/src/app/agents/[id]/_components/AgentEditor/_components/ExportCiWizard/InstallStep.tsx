"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { Wizard } from "./useExportCiWizard";
import { DOCS_URL } from "./constants";
import { s } from "./styles";

type Mode = "open_pr" | "zip";

export function InstallStep({ w }: { w: Wizard }) {
  const t = useTranslations("ci");
  const mode = w.state.mode;
  const [focused, setFocused] = useState<Mode | null>(null);
  const card = (m: Mode) => ({
    ...s.optionCard,
    ...(mode === m ? s.optionCardActive : null),
    ...(focused === m ? s.optionCardFocus : null),
  });
  const radio = (m: Mode) => (
    <input
      type="radio"
      name="ci-install"
      style={s.srOnly}
      checked={mode === m}
      onChange={() => w.setMode(m)}
      onFocus={() => setFocused(m)}
      onBlur={() => setFocused(null)}
    />
  );
  return (
    <>
      <div role="radiogroup" aria-label={t("exportWizard.steps.install")} style={s.field}>
        <label style={{ ...card("open_pr"), alignItems: "flex-start" }}>
          {radio("open_pr")}
          <span style={s.cardCol}>
            <span style={s.cardHead}>
              <Icon.GitPullRequest size={18} />
              <span style={s.cardTitle}>{t("exportWizard.installStep.prTitle")}</span>
              <span style={s.pushRight}>
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.installStep.recommended")}</Badge>
              </span>
            </span>
            <span style={s.cardDesc}>
              {t.rich("exportWizard.installStep.prBody", {
                repo: w.repo,
                count: w.files.length,
                code: (chunks) => <code className="mono">{chunks}</code>,
              })}
            </span>
          </span>
        </label>
        <label style={card("zip")}>
          {radio("zip")}
          <span style={s.cardHead}>
            <Icon.Copy size={18} />
            <span style={s.cardTitle}>{t("exportWizard.installStep.zipTitle")}</span>
            <span style={{ ...s.cardDesc, ...s.pushRight, color: "var(--text-muted)" }}>
              {t("exportWizard.installStep.zipBody")}
            </span>
          </span>
        </label>
      </div>

      {w.installError && (
        <div role="alert" style={s.warn}>
          {t("exportWizard.installStep.failed", { reason: w.installError.message })}
          {mode === "open_pr" && <div style={s.warnHint}>{t("exportWizard.installStep.tokenHint")}</div>}
          {mode === "open_pr" && (
            <div style={{ marginTop: 8 }}>
              <Button kind="secondary" size="sm" onClick={() => w.setMode("zip")}>
                {t("exportWizard.installStep.switchToZip")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={s.docsRow}>
        {t("exportWizard.installStep.docsPrefix")}{" "}
        <a href={DOCS_URL} target="_blank" rel="noreferrer" style={s.link}>
          {t("exportWizard.installStep.docs")}
          <Icon.ArrowRight size={12} />
        </a>
      </div>
    </>
  );
}
