/* SkillCard — clone of AgentCard's shape for a skill row: type + source badges,
   description, enabled toggle, "N agents" (from agent_count), and a "needs
   vetting" indicator for disabled non-manual (imported) skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { typeColor, typeIcon, sourceIcon } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill & { agent_count?: number };
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const color = typeColor(skill.type);
  const TypeIcon = Icon[typeIcon(skill.type)];
  const needsVetting = skill.source !== "manual" && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.cardHeaderRow}>
        <div style={s.cardIconBox(color)}>
          <TypeIcon size={15} />
        </div>
        <span style={s.cardName}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.cardDeleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.cardDescription}>{skill.description || t("card.noDescription")}</div>
      <div style={s.cardMetaRow}>
        <Badge color={color}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)" icon={sourceIcon(skill.source)}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      {skill.agent_count != null && (
        <div style={s.cardFooter}>
          <Icon.Cpu size={13} />
          {t("card.agentCount", { count: skill.agent_count })}
        </div>
      )}
    </div>
  );
}
