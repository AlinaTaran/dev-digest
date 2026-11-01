"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Skeleton, TextInput } from "@devdigest/ui";
import { DEFAULT_PROJECT_CONTEXT_GLOBS } from "./constants";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle/SectionTitle";
import { s } from "./styles";

/**
 * Settings → Project Context. Edits `settings.project_context_globs`; the server
 * validates them (400 invalid_project_context_globs) and keeps the old value on
 * rejection, so a failed save only shows the message and leaves the draft editable.
 */
export function SettingsProjectContext() {
  const t = useTranslations("settings");
  const { data: settings, isLoading } = useSettings();
  if (isLoading || !settings) {
    return (
      <div style={s.wrap}>
        <SectionTitle title={t("projectContext.title")} body={t("projectContext.body")} />
        <Skeleton height={36} />
      </div>
    );
  }
  const saved = settings.project_context_globs ?? [...DEFAULT_PROJECT_CONTEXT_GLOBS];
  return <GlobsForm initial={saved} />;
}

function GlobsForm({ initial }: { initial: string[] }) {
  const t = useTranslations("settings");
  const update = useUpdateSettings();
  const [globs, setGlobs] = React.useState<string[]>(initial);

  const edit = (i: number, v: string) => setGlobs((g) => g.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => setGlobs((g) => g.filter((_, j) => j !== i));
  const add = () => setGlobs((g) => [...g, ""]);
  const save = () => update.mutate({ project_context_globs: globs.map((g) => g.trim()).filter(Boolean) });

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("projectContext.title")} body={t("projectContext.body")} />
      <FormField label={t("projectContext.globLabel")}>
        {globs.map((g, i) => (
          <div key={i} style={s.row}>
            <div style={s.input}>
              <TextInput
                mono
                value={g}
                onChange={(v) => edit(i, v)}
                placeholder={t("projectContext.globPlaceholder")}
                aria-label={t("projectContext.globInput", { n: i + 1 })}
              />
            </div>
            <Button kind="ghost" icon="X" aria-label={t("projectContext.remove", { glob: g || String(i + 1) })} onClick={() => remove(i)} />
          </div>
        ))}
        <Button kind="secondary" icon="Plus" onClick={add}>
          {t("projectContext.add")}
        </Button>
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" loading={update.isPending} onClick={save}>
          {update.isPending ? t("projectContext.saving") : t("projectContext.save")}
        </Button>
        {update.isSuccess && <span style={s.saved}>{t("projectContext.saved")}</span>}
      </div>
      {update.isError && (
        <div role="alert" style={s.error}>
          {t("projectContext.error", { message: update.error.message })}
        </div>
      )}
    </div>
  );
}
