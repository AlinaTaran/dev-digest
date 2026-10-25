"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CodeTextarea, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc, useSaveContextDoc } from "@/lib/hooks";
import { distinctAgentCount } from "../../helpers";
import { classifySaveError } from "./helpers";
import { s } from "./styles";

type Mode = "preview" | "edit";

/** Preview / edit one doc. Remount per path (`key`) so draft state never leaks across docs. */
export function DocPanel({
  repoId,
  path,
  onDirtyChange,
}: {
  repoId: string;
  path: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("context");
  const { data: doc, isLoading, isError, refetch } = useContextDoc(repoId, path);
  const save = useSaveContextDoc();
  const [mode, setMode] = React.useState<Mode>("preview");
  const [draft, setDraft] = React.useState<string | null>(null);

  const text = draft ?? doc?.content ?? "";
  const dirty = draft !== null && doc !== undefined && draft !== doc.content;

  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  if (isLoading) {
    return (
      <div style={s.stack}>
        <Skeleton height={20} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (isError || !doc) {
    return <ErrorState title={t("doc.loadError")} onRetry={() => refetch()} />;
  }

  const agents = distinctAgentCount(doc.used_by_agents);
  const errKind = save.isError ? classifySaveError(save.error) : null;

  const onSave = () =>
    save.mutate(
      { repoId, path, content: text, base_hash: doc.content_hash },
      {
        onSuccess: () => {
          setDraft(null);
          setMode("preview");
        },
      },
    );
  const onReload = () => {
    save.reset();
    setDraft(null);
    void refetch();
  };

  return (
    <div>
      <div style={s.head}>
        <span className="mono" style={s.path} title={doc.path}>
          {doc.path}
        </span>
        <span style={s.meta}>{t("doc.tokens", { count: doc.tokens })}</span>
        <span style={s.meta}>{agents === 1 ? t("doc.usedByOne") : t("doc.usedBy", { count: agents })}</span>
        <div role="group" aria-label={t("doc.viewMode")} style={s.toggle}>
          <Button size="sm" kind={mode === "preview" ? "primary" : "secondary"} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
            {t("doc.preview")}
          </Button>
          <Button size="sm" kind={mode === "edit" ? "primary" : "secondary"} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
            {t("doc.edit")}
          </Button>
        </div>
      </div>

      <div style={s.content}>
        {mode === "preview" ? (
          <Markdown>{text}</Markdown>
        ) : (
          <>
            <p style={s.warn}>{t("doc.editWarning")}</p>
            <CodeTextarea value={text} onChange={save.isPending ? undefined : setDraft} rows={20} ariaLabel={t("doc.editorLabel")} />
            <div style={s.actions}>
              {errKind && (
                <span role="alert" style={s.error}>
                  {t(`saveError.${errKind}`)}
                  {errKind === "conflict" && (
                    <Button size="sm" kind="ghost" onClick={onReload}>
                      {t("saveError.reload")}
                    </Button>
                  )}
                </span>
              )}
              {!errKind && <span style={s.error} />}
              <Button kind="ghost" disabled={!dirty || save.isPending} onClick={() => { save.reset(); setDraft(null); }}>
                {t("doc.discard")}
              </Button>
              <Button kind="primary" disabled={!dirty || save.isPending} loading={save.isPending} onClick={onSave}>
                {save.isPending ? t("doc.saving") : t("doc.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
