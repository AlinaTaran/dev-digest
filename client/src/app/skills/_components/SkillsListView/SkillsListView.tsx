/* /skills — Skills Lab master-detail shell with nothing selected: SkillsRail
   (left) + a "Select a skill" prompt (right), mirroring the layout
   /skills/:id fills in with the SkillEditor. */
"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "../../../../components/app-shell";
import { SkillsRail } from "../SkillsRail/SkillsRail";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.shell}>
        <SkillsRail />
        <div style={s.emptyPane}>
          <div style={s.emptyCard}>
            <h2 style={s.emptyTitle}>{t("page.selectPrompt.title")}</h2>
            <p style={s.emptyBody}>{t("page.selectPrompt.body")}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
