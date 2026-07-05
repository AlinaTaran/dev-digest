/* SkillEditor — 5-tab studio for a skill, mirroring the Agent editor's shape:
   Config (edit + save), Preview (rendered Markdown), Versions (history + diff
   + restore), Stats (DB-derivable usage), Evals (stub). Tab state lives in the
   parent's ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab/VersionsTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { EvalsTab } from "./_components/EvalsTab/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  // key remounts the active tab's form on skill switch, re-seeding internal
  // state from props/queries instead of carrying over stale state.
  let content: React.ReactNode;
  switch (tab) {
    case "preview":
      content = <PreviewTab skill={skill} />;
      break;
    case "versions":
      content = <VersionsTab key={skill.id} skill={skill} />;
      break;
    case "stats":
      content = <StatsTab key={skill.id} skill={skill} />;
      break;
    case "evals":
      content = <EvalsTab />;
      break;
    case "config":
    default:
      content = <ConfigTab key={skill.id} skill={skill} />;
      break;
  }

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>{content}</div>
    </div>
  );
}
