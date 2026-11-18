"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CodeTextarea, Icon } from "@devdigest/ui";
import type { Wizard } from "./useExportCiWizard";
import { s } from "./styles";

export function PreviewStep({ w }: { w: Wizard }) {
  const t = useTranslations("ci");
  const { preview, files, selectedFile: file } = w;

  if (preview.isPending) return <div style={s.info}>{t("exportWizard.preview.generating")}</div>;
  if (preview.isError) {
    return (
      <div role="alert" style={s.warn}>
        {t("exportWizard.preview.failed", { reason: preview.error.message })}
      </div>
    );
  }

  const isRunner = file?.version != null;
  return (
    <div style={s.previewGrid}>
      <div style={s.previewList}>
        <div style={s.sectionLabel}>{t("exportWizard.preview.filesToCreate")}</div>
        <div style={s.fileList}>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className="mono"
              aria-pressed={f.path === file?.path}
              style={{ ...s.fileBtn, ...(f.path === file?.path ? s.fileBtnActive : {}) }}
              onClick={() => w.selectFile(f.path)}
            >
              <Icon.FileText size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              {f.path}
            </button>
          ))}
        </div>
      </div>
      {file && (
        <div style={s.previewPane}>
          <div style={s.paneHead}>
            <span className="mono">{file.path}</span>
            {file.editable ? (
              <Badge icon="Edit">{t("exportWizard.preview.editable")}</Badge>
            ) : (
              <Badge>{t("exportWizard.preview.readOnly")}</Badge>
            )}
          </div>
          <div style={s.paneBody}>
          {isRunner ? (
            <div style={s.info}>
              <div className="mono">{t("exportWizard.preview.runnerVersion", { version: file.version ?? "" })}</div>
              <div>{t("exportWizard.preview.runnerNote")}</div>
            </div>
          ) : file.editable ? (
            <CodeTextarea
              value={w.state.edited ?? file.contents}
              onChange={w.editWorkflow}
              rows={14}
              ariaLabel={t("exportWizard.preview.contentsOf", { path: file.path })}
            />
          ) : (
            // Plain text node: generated content is never interpreted as HTML.
            <pre className="mono" style={s.pre} aria-label={t("exportWizard.preview.contentsOf", { path: file.path })}>
              {file.contents || t("exportWizard.preview.emptyFile")}
            </pre>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
