"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SelectInput } from "@devdigest/ui";
import type { Wizard } from "./useExportCiWizard";
import { s } from "./styles";

export function TargetStep({ w }: { w: Wizard }) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.card}>
        <div style={s.cardTop}>
          <span style={s.iconTile}>
            <Icon.Workflow size={18} />
          </span>
          <span style={s.cardTitle}>{t("exportWizard.target.ghaTitle")}</span>
          <span style={s.pushRight}>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.target.recommended")}</Badge>
          </span>
        </div>
        <div style={s.cardDesc}>{t("exportWizard.target.ghaDesc")}</div>
      </div>

      {w.repos.length === 0 ? (
        <div style={s.info}>{t("exportWizard.target.noRepos")}</div>
      ) : (
        <label style={s.field}>
          {t("exportWizard.target.repoLabel")}
          <SelectInput
            value={w.repo}
            onChange={w.setRepo}
            options={w.repos.map((r) => r.full_name)}
          />
          <span style={s.hint}>{t("exportWizard.target.repoHint")}</span>
        </label>
      )}

      {!w.supported && (
        <div role="alert" style={s.warn}>
          {t("exportWizard.target.unsupportedProvider")}
        </div>
      )}
    </>
  );
}
