import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { Button } from "@devdigest/ui";
import { shortSha } from "../../helpers";

const SETTINGS_HREF = "/settings/api-keys";

const banner: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", fontSize: 13,
  border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", color: "var(--text-secondary)",
};
const link: React.CSSProperties = { color: "var(--accent-text)", textDecoration: "underline" };

export interface BannersProps {
  data: OnboardingTourResponse;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

/** Stale / degraded / partial / last-regeneration-failed notices above the sections. */
export function Banners({ data, canRegenerate, onRegenerate }: BannersProps) {
  const t = useTranslations("onboarding");
  const tour = data.tour;
  if (!tour) return null;
  const { generation } = data;

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {data.stale && (
        <div role="status" style={banner}>
          <span>{t("banner.stale", { from: shortSha(tour.source_sha), to: shortSha(data.current_index_sha) })}</span>
          <span style={{ marginLeft: "auto" }}>
            <Button size="sm" disabled={!canRegenerate} onClick={onRegenerate}>{t("regenerate")}</Button>
          </span>
        </div>
      )}
      {tour.reasons.map((reason) => (
        <div key={reason} role="status" style={banner}>
          <span>{t(`degraded.${reason}`)}</span>
          {reason === "llm_unavailable" && (
            <Link href={SETTINGS_HREF} style={link}>{t("banner.settingsLink")}</Link>
          )}
        </div>
      ))}
      {tour.index_status === "partial" && (
        <div role="status" style={banner}>{t("banner.partial", { count: tour.files_indexed.toLocaleString("en-US") })}</div>
      )}
      {generation?.status === "failed" && (
        <div role="status" style={banner}>
          {t("banner.lastRegenFailed", { reason: t(`reasons.${generation.error_reason ?? "internal"}`) })}
        </div>
      )}
    </div>
  );
}
