/* ImportSkillDrawer — "From file" import only (confirmed scope): pick a .md/.zip
   file, preview the extracted {name,description,type,body} + ignored[] entries
   (never executed — read into memory only), let the user edit before saving.
   Confirm always creates with source:'extracted', enabled:false (vet-before-enable). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, TextInput, SelectInput, Textarea, Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useImportSkill, useCreateSkill, type SkillImportPreview } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { TYPE_VALUES } from "../CreateSkillModal/constants";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const importSkill = useImportSkill();
  const create = useCreateSkill();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const pickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a failure
    if (!file) return;
    try {
      const result = await importSkill.mutateAsync(file);
      setPreview(result);
      setName(result.name);
      setDescription(result.description);
      setType(result.type);
      setBody(result.body);
    } catch {
      toast.error(t("drawer.importFailed"));
    }
  };

  const confirm = async () => {
    const skill = await create.mutateAsync({
      name,
      description,
      type,
      body,
      source: "extracted",
      enabled: false,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Drawer
      width={640}
      title={t("drawer.title")}
      subtitle={t("drawer.fileOnlySubtitle")}
      onClose={onClose}
      footer={
        preview && (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("create.cancel")}
            </Button>
            <Button kind="primary" icon="Plus" onClick={confirm} disabled={create.isPending || !name.trim()}>
              {create.isPending ? t("file.confirming") : t("file.confirm")}
            </Button>
          </div>
        )
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.zip"
        onChange={onFileChange}
        style={{ display: "none" }}
        data-testid="skill-file-input"
      />
      {!preview && (
        <div style={s.pickWrap}>
          <Button kind="secondary" icon="Upload" onClick={pickFile} disabled={importSkill.isPending}>
            {importSkill.isPending ? t("file.importingPreview") : t("file.pickLabel")}
          </Button>
          <p style={s.pickHint}>{t("file.pickHint")}</p>
        </div>
      )}
      {preview && (
        <div style={s.body}>
          <div style={s.previewBanner}>{t("file.previewNotice")}</div>
          <FormField label={t("file.nameLabel")} required>
            <TextInput value={name} onChange={setName} />
          </FormField>
          <FormField label={t("file.descriptionLabel")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("file.typeLabel")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>
          <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
            <Textarea value={body} onChange={setBody} rows={10} mono />
          </FormField>
          {preview.ignored.length > 0 && (
            <FormField label={t("file.ignoredTitle")} hint={t("file.ignoredHint")}>
              <ul style={s.ignoredList}>
                {preview.ignored.map((path) => (
                  <li key={path} style={s.ignoredItem}>
                    <Icon.File size={12} style={s.ignoredIcon} />
                    <span className="mono">{path}</span>
                  </li>
                ))}
              </ul>
            </FormField>
          )}
          <Button kind="tertiary" size="sm" onClick={pickFile} disabled={importSkill.isPending}>
            {t("file.chooseAnother")}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
