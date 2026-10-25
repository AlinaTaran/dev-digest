"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../styles";

export function BriefEmptyState({
  onGenerate,
  pending,
  disabled,
}: {
  onGenerate: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.emptyState}>
      <p style={s.emptyBody}>{t("prBrief.emptyBody")}</p>
      <Button
        kind="primary"
        icon="Sparkles"
        onClick={onGenerate}
        loading={pending}
        disabled={disabled}
        aria-busy={pending || undefined}
      >
        {pending ? t("prBrief.generating") : t("prBrief.generate")}
      </Button>
    </div>
  );
}
