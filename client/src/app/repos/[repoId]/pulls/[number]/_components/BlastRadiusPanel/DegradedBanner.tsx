"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { BlastDegradedReason } from "@/lib/types";
import { useBlastResync } from "@/lib/hooks/blast";
import { s } from "./styles";

interface DegradedBannerProps {
  prId: string | null;
  repoId: string | null;
  reason: BlastDegradedReason | null;
}

export function DegradedBanner({ prId, repoId, reason }: DegradedBannerProps) {
  const t = useTranslations("blast");
  const resync = useBlastResync(prId, repoId);
  return (
    <div style={s.banner}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        {t("degraded.badge")}
      </Badge>
      {reason && <span>{t(`degraded.reason.${reason}`)}</span>}
      {repoId && (
        <Button kind="ghost" size="sm" icon="RefreshCw" loading={resync.isResyncing} disabled={!resync.canStart} onClick={resync.start}>
          {t(resync.isResyncing ? "resync.running" : "resync.button")}
        </Button>
      )}
      {resync.isResyncing && <span style={s.bannerNote}>{t("resync.started")}</span>}
      {resync.timedOut && <span style={s.bannerNote}>{t("resync.timeout")}</span>}
      {resync.isError && <span style={s.bannerNote}>{t("resync.failed")}</span>}
    </div>
  );
}
