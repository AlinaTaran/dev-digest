"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { sha7 } from "../helpers";
import { s } from "../styles";

export function StaleBanner({
  briefSha,
  currentSha,
  onRegenerate,
  pending,
}: {
  briefSha: string;
  currentSha: string;
  onRegenerate: () => void;
  pending: boolean;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.banner}>
      <span>{t("prBrief.stale", { from: sha7(briefSha), to: sha7(currentSha) })}</span>
      <Button size="sm" onClick={onRegenerate} loading={pending} aria-busy={pending || undefined}>
        {t("prBrief.regenerate")}
      </Button>
    </div>
  );
}
