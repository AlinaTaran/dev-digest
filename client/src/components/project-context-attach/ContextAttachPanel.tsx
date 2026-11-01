"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { ContextListing, ContextAttachedItem, ContextInheritedItem } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { ContextAttachList, ContextHint } from "./ContextAttachList";
import { ContextPreviewDialog } from "./ContextPreviewDialog";
import { buildAttachLabels, buildPreviewLabels } from "./labels";
import { s } from "./styles";

/** The slice of an agent/skill context response the panel renders. */
export interface PanelContextData {
  attached: ContextAttachedItem[];
  inherited?: ContextInheritedItem[];
  total_tokens: number;
}

interface Props {
  /** Tab-specific strings (the shared ones live in the `context` namespace). */
  title: string;
  hint: string;
  listing: { data?: ContextListing; isError: boolean };
  context: { data?: PanelContextData; isError: boolean };
  put: { isPending: boolean; isError: boolean };
  /** Persist the full ordered path list. */
  onChange: (repoId: string, paths: string[]) => void;
  /** Preview as an eye icon button instead of a labelled button. */
  compactPreview?: boolean;
  /** Counter as "N attached" instead of "N of M attached" (skill tab design). */
  compactCounter?: boolean;
  /** Optional read-only block under the list (skill tab: "Serializes as"). */
  serialized?: { label: string; text: string };
}

/** Container shared by the agent and skill Context tabs: load/error/not-cloned branches, list, save error, preview. */
export function ContextAttachPanel({
  title,
  hint,
  listing,
  context,
  put,
  onChange,
  compactPreview,
  compactCounter,
  serialized,
}: Props) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const heading = (
    <>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
      </div>
      <ContextHint text={hint} />
    </>
  );
  const frame = (body: React.ReactNode) => (
    <div style={s.wrap}>
      {heading}
      {body}
    </div>
  );

  if (!repoId) {
    return frame(<EmptyState icon="FileText" title={t("attach.noRepoTitle")} body={t("attach.noRepoBody")} />);
  }
  if (listing.data?.degraded) {
    return frame(<EmptyState icon="FileText" title={t("attach.notClonedTitle")} body={t("attach.notClonedBody")} />);
  }
  if (listing.isError || context.isError) {
    return frame(
      <div role="alert" style={s.empty}>
        {t("attach.loadError")}
      </div>,
    );
  }
  if (!listing.data || !context.data) {
    return frame(<div style={s.empty}>{t("attach.loading")}</div>);
  }

  const docs = listing.data.docs;
  const ctx = context.data;

  return (
    <div style={s.wrap}>
      <ContextAttachList
        docs={docs}
        attached={ctx.attached}
        inherited={ctx.inherited}
        totalTokens={ctx.total_tokens}
        labels={buildAttachLabels(t, ctx.attached.length, docs.length, compactCounter)}
        title={title}
        hint={hint}
        compactPreview={compactPreview}
        onChange={(paths) => onChange(repoId, paths)}
        onPreview={setPreviewPath}
        disabled={put.isPending}
      />
      {put.isError && (
        <div role="alert" style={s.empty}>
          {t("attach.saveError")}
        </div>
      )}
      {serialized && (
        <>
          <div style={s.groupLabel}>{serialized.label}</div>
          <pre className="mono" style={s.serialized} data-testid="context-serialized">
            {serialized.text}
          </pre>
        </>
      )}
      {previewPath && (
        <ContextPreviewDialog
          repoId={repoId}
          path={previewPath}
          labels={buildPreviewLabels(t)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
