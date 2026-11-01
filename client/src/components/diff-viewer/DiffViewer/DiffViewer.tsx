/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard/FileCard";

export function DiffViewer({
  files,
  commenting,
  target,
  lineNotInDiffText,
  onTargetReached,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Deep-link target: the matching card opens, scrolls and flashes the line. */
  target?: { file: string; line: number | null };
  lineNotInDiffText?: string;
  onTargetReached?: (found: boolean) => void;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard
          key={f.path}
          file={f}
          commenting={commenting}
          {...(target?.file === f.path
            ? { forceOpen: true, scrollToLine: target.line, lineNotInDiffText, onTargetReached }
            : {})}
        />
      ))}
    </div>
  );
}
