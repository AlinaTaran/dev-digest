"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, CodeTextarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { TYPE_VALUES } from "../../../CreateSkillModal/constants";
import { estimateTokens } from "./helpers";
import { s } from "./styles";

/** Config tab — name/description/type/Markdown body + enabled toggle. The body
    is what gets appended to a linked agent's assembled prompt as instructions,
    so the description hints at writing it as a clear directive. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  // Switching skills remounts this component (key={skill.id} at the call
  // site), so these useState initializers re-seed the form — no reset effect.

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const tokenCount = estimateTokens(body);
  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge color="var(--text-secondary)" mono icon="GitBranch">
          {t("preview.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={
          <div style={s.bodyLabelRow}>
            <span className="mono">{t("config.bodyFileName", { name: skill.name })}</span>
            {dirty && (
              <Badge color="var(--warn)" bg="var(--warn-bg)">
                {t("config.unsaved")}
              </Badge>
            )}
          </div>
        }
        hint={t("config.bodyHint")}
        right={<span style={s.tokenCount}>{t("config.approxTokens", { count: tokenCount })}</span>}
      >
        <CodeTextarea value={body} onChange={setBody} rows={16} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>}
      </div>
    </div>
  );
}
