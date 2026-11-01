import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { Button, Icon } from "@devdigest/ui";
import { useElapsedSeconds } from "../../helpers";

const wrap: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 28px", gap: 8,
};
const iconBox: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10, display: "grid", placeItems: "center", marginBottom: 8,
  background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)",
};
const titleS: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" };
const body: React.CSSProperties = { fontSize: 14, color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.5 };
const note: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)" };
const failed: React.CSSProperties = { fontSize: 13, color: "var(--danger, var(--text-secondary))" };

export interface TourEmptyStateProps {
  availability: OnboardingTourResponse["availability"];
  generation: OnboardingTourResponse["generation"];
  starting: boolean;
  onGenerate: () => void;
  onResync: () => void;
  resyncing: boolean;
}

/** No tour yet: the single Generate CTA, or the reason generation is unavailable (AC-9, AC-44, AC-45, AC-66, AC-72). */
export function TourEmptyState({ availability, generation, starting, onGenerate, onResync, resyncing }: TourEmptyStateProps) {
  const t = useTranslations("onboarding");
  const generating = generation?.status === "generating";
  const elapsed = useElapsedSeconds(generation?.started_at, generating);

  if (availability.reason === "no_index") {
    return (
      <div style={wrap}>
        <div style={iconBox}><Icon.Database size={22} /></div>
        <div style={titleS}>{t("unavailable.noIndex.title")}</div>
        <div style={body}>{t("unavailable.noIndex.body")}</div>
        <div style={{ marginTop: 12 }}>
          <Button icon="RefreshCw" disabled={resyncing} onClick={onResync}>{t("unavailable.noIndex.resync")}</Button>
        </div>
      </div>
    );
  }

  if (availability.reason === "not_cloned") {
    return (
      <div style={wrap}>
        <div style={iconBox}><Icon.GitBranch size={22} /></div>
        <div style={titleS}>{t("unavailable.notCloned.title")}</div>
        <div style={body}>{t("unavailable.notCloned.body")}</div>
        <div style={{ marginTop: 12 }}>
          <Button icon="Sparkles" disabled>{t("empty.cta")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={iconBox}><Icon.Workflow size={22} /></div>
      <div style={titleS}>{t("empty.title")}</div>
      <div style={body}>{t("empty.body")}</div>
      {generation?.status === "failed" && (
        <div role="status" style={failed}>
          {t("empty.lastFailed", { reason: t(`reasons.${generation.error_reason ?? "internal"}`) })}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Button icon="Sparkles" disabled={generating || starting} onClick={onGenerate}>
          {generating ? t("empty.generating") : t("empty.cta")}
        </Button>
      </div>
      {generating && <div style={note}>{t("empty.elapsed", { seconds: elapsed })}</div>}
    </div>
  );
}
