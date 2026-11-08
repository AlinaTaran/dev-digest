/* SkillEditor — 5-tab studio for a skill, mirroring the Agent editor's shape:
   Config (edit + save), Preview (rendered Markdown), Versions (history + diff
   + restore), Stats (DB-derivable usage), Evals (cases + runs on a host agent). Tab state lives in the
   parent's ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab/VersionsTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { EvalsTab } from "./_components/EvalsTab/EvalsTab";
import { RunOnEvalsButton } from "./_components/EvalsTab/RunOnEvalsButton";
import { useSkillEvalRunner } from "./_components/EvalsTab/useSkillEvalRunner";
import { typeColor } from "../SkillsRail/helpers";
import { ContextTab } from "./_components/ContextTab/ContextTab";
import { TABS } from "./constants";
import { s } from "./styles";

interface SkillEditorProps {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}

/** Keyed by skill so the eval runner state (host pick, attached run) resets on skill switch. The header
    (title row + "Run on evals") lives here so it shares that runner with the Evals tab. */
export function SkillEditor(props: SkillEditorProps) {
  return <SkillEditorBody key={props.skill.id} {...props} />;
}

function SkillEditorBody({ skill, tab, onTab }: SkillEditorProps) {
  const t = useTranslations("skills");
  const runner = useSkillEvalRunner(skill);
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
    case "context":
      content = <ContextTab key={skill.id} skill={skill} />;
      break;
    case "evals":
      content = <EvalsTab key={skill.id} skill={skill} runner={runner} />;
      break;
    case "config":
    default:
      content = <ConfigTab key={skill.id} skill={skill} />;
      break;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.title}>{skill.name}</h1>
        <Badge color={typeColor(skill.type)}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono icon="GitBranch">
          {t("preview.version", { version: skill.version })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
        <div style={s.runOnEvals}>
          <RunOnEvalsButton runner={runner} onStarted={() => onTab("evals")} />
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>{content}</div>
    </div>
  );
}
