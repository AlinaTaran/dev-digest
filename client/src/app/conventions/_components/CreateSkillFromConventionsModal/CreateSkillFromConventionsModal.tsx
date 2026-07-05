"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, CodeTextarea, Toggle, Badge, Icon } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkill, type CreateSkillInput } from "@/lib/hooks/skills";
import { buildBodyMarkdown, estimateTokens } from "./helpers";
import { MODAL_WIDTH, DEFAULT_TYPE, TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Bundles the currently-accepted convention candidates into a new Skill.
    Clones skills' CreateSkillModal structure (Modal/FormField/TextInput/
    Textarea, Cancel/Create footer). name/description/body are prefilled from
    the candidates but stay fully editable before submit. */
export function CreateSkillFromConventionsModal({
  candidates,
  repoName,
  onClose,
}: {
  /** Accepted candidates only — the caller filters by status === 'accepted'. */
  candidates: ConventionCandidate[];
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState(`${repoName}-conventions`);
  const [description, setDescription] = React.useState(
    t("createSkillModal.defaultDescription", { count: candidates.length, repoName }),
  );
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState(() => buildBodyMarkdown(`${repoName}-conventions`, candidates));
  const [enabled, setEnabled] = React.useState(true);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`createSkillModal.typeOptions.${v}`) }));
  const tokenCount = estimateTokens(body);

  const submit = async () => {
    // evidence_files isn't on CreateSkillInput yet (client-only extension —
    // see report); assigning through a typed intersection (not an inline
    // object literal) avoids an excess-property error while still sending the
    // field over the wire (api.post JSON-serializes whatever it's given).
    const payload: CreateSkillInput & { evidence_files: string[] } = {
      name: name.trim() || `${repoName}-conventions`,
      description,
      type,
      body,
      source: "extracted",
      enabled,
      evidence_files: Array.from(new Set(candidates.map((c) => c.evidence_path))),
    };
    const skill = await create.mutateAsync(payload);
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkillModal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("createSkillModal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending || candidates.length === 0}>
            {create.isPending ? t("createSkillModal.creating") : t("createSkillModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.mergedBanner}>
          <Icon.Link size={15} style={s.mergedBannerIcon} />
          <span>{t("createSkillModal.mergedBanner", { count: candidates.length, repoName })}</span>
        </div>

        <FormField label={t("createSkillModal.fields.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("createSkillModal.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.typeEnabledRow}>
          <div style={s.typeEnabledCol}>
            <FormField label={t("createSkillModal.fields.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
          </div>
          <div style={s.typeEnabledCol}>
            <FormField label={t("createSkillModal.enabledLabel")} hint={t("createSkillModal.enabledHint")}>
              <Toggle on={enabled} onChange={setEnabled} size={16} />
            </FormField>
          </div>
        </div>
        <FormField
          label={
            <div style={s.bodyLabelRow}>
              <span className="mono">{t("createSkillModal.fields.bodyFileName", { name: name.trim() || `${repoName}-conventions` })}</span>
              <Badge color="var(--warn)" bg="var(--warn-bg)">
                {t("createSkillModal.unsaved")}
              </Badge>
            </div>
          }
          hint={t("createSkillModal.fields.bodyHint")}
          right={<span style={s.tokenCount}>{t("createSkillModal.tokenCount", { count: tokenCount })}</span>}
        >
          <CodeTextarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
      </div>
    </Modal>
  );
}
