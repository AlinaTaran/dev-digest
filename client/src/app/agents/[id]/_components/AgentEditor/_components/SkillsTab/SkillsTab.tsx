"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Checkbox, TextInput } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { arrayMove, estimateSkillTokens } from "./helpers";
import { s } from "./styles";

type WorkspaceSkill = Skill & { agent_count: number };

/** Skills tab — every workspace skill with an attach checkbox, plus native
 *  HTML5 drag-and-drop reordering of the attached ones. Any attach/detach/
 *  reorder posts the full ordered skill_ids list via useSetAgentSkills(). */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: allSkills } = useSkills();
  const { data: linked } = useAgentSkills(agent.id);
  const setAgentSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const skills: WorkspaceSkill[] = allSkills ?? [];
  const byId = React.useMemo(() => new Map(skills.map((sk) => [sk.id, sk])), [skills]);

  // Order comes from the link rows (order ASC); this is the id list any
  // attach/detach/reorder mutation posts back. The link endpoint returns bare
  // AgentSkillLink rows (agent_id/skill_id/order), not a joined skill — look
  // the skill up in `byId` (from useSkills()) for anything beyond the id.
  const attachedIds = React.useMemo(
    () => [...(linked ?? [])].sort((a, b) => a.order - b.order).map((l) => l.skill_id),
    [linked],
  );
  const attachedSet = React.useMemo(() => new Set(attachedIds), [attachedIds]);

  const enabledAttached = attachedIds.filter((id) => byId.get(id)?.enabled).length;

  const setIds = (ids: string[]) => setAgentSkills.mutate({ agentId: agent.id, skillIds: ids });

  const toggle = (skillId: string, checked: boolean) => {
    const next = checked ? [...attachedIds, skillId] : attachedIds.filter((id) => id !== skillId);
    setIds(next);
  };

  const handleDrop = (targetId: string) => {
    setOverId(null);
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const from = attachedIds.indexOf(dragId);
    const to = attachedIds.indexOf(targetId);
    setDragId(null);
    if (from === -1 || to === -1) return;
    setIds(arrayMove(attachedIds, from, to));
  };

  const query = filter.trim().toLowerCase();
  const matches = (sk: WorkspaceSkill) => !query || sk.name.toLowerCase().includes(query);

  const attached = attachedIds.map((id) => byId.get(id)).filter((sk): sk is WorkspaceSkill => !!sk).filter(matches);
  const available = skills.filter((sk) => !attachedSet.has(sk.id)).filter(matches);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabledAttached, total: skills.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />

      <div style={s.groupLabel}>{t("skills.attachedGroup", { count: attached.length })}</div>
      <div style={s.group}>
        {attached.length === 0 && <div style={s.empty}>{t("skills.emptyAttached")}</div>}
        {attached.map((sk) => (
          <div
            key={sk.id}
            draggable
            onDragStart={() => setDragId(sk.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== sk.id) setOverId(sk.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === sk.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(sk.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            style={s.row(true, overId === sk.id)}
            data-testid={`skill-row-${sk.id}`}
          >
            <Icon.Menu size={14} style={s.grip} aria-hidden />
            <Checkbox checked onChange={(v) => toggle(sk.id, v)} />
            <div style={s.info}>
              <span style={s.name}>{sk.name}</span>
              <span style={s.meta}>
                {sk.type} · {t("skills.approxTokens", { count: estimateSkillTokens(sk) })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {available.length > 0 && (
        <>
          <div style={s.groupLabel}>{t("skills.availableGroup", { count: available.length })}</div>
          <div style={s.group}>
            {available.map((sk) => (
              <div key={sk.id} style={s.row(false, false)} data-testid={`skill-row-${sk.id}`}>
                <Checkbox checked={false} onChange={(v) => toggle(sk.id, v)} />
                <div style={s.info}>
                  <span style={s.name}>{sk.name}</span>
                  <span style={s.meta}>
                    {sk.type} · {t("skills.approxTokens", { count: estimateSkillTokens(sk) })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
