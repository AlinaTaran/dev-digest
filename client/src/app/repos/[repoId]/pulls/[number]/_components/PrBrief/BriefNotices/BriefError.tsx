"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../styles";

const RETRYABLE = ["llm_failed", "invalid_output", "timeout"] as const;
type Retryable = (typeof RETRYABLE)[number];

function isRetryable(r: string): r is Retryable {
  return (RETRYABLE as readonly string[]).includes(r);
}

export function BriefError({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const t = useTranslations("brief");

  if (reason === "llm_not_configured") {
    return (
      <div role="alert" style={s.error}>
        <span>{t("prBrief.errors.llmNotConfigured")}</span>
        <Link href="/settings/api-keys">{t("prBrief.errors.settingsLink")}</Link>
      </div>
    );
  }
  if (reason === "pr_not_synced") {
    return (
      <div role="alert" style={s.error}>
        <span>{t("prBrief.errors.prNotSynced")}</span>
      </div>
    );
  }
  const key = isRetryable(reason) ? reason : "unknown";
  return (
    <div role="alert" style={s.error}>
      <span>{t("prBrief.errors.prefix", { reason: t(`prBrief.errors.reasons.${key}`) })}</span>
      <Button size="sm" onClick={onRetry}>
        {t("prBrief.errors.retry")}
      </Button>
    </div>
  );
}
