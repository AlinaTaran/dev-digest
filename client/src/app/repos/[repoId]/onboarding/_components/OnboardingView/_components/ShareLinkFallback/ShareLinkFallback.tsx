import React from "react";
import { useTranslations } from "next-intl";

const wrap: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" };
const input: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid var(--border-strong)", borderRadius: 6,
  background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12.5,
};

/** Shown when the clipboard write is rejected: a read-only field the user can copy by hand (AC-57). */
export function ShareLinkFallback({ url }: { url: string }) {
  const t = useTranslations("onboarding");
  return (
    <label style={wrap}>
      <span>{t("share.manualHint")}</span>
      <input
        readOnly
        className="mono"
        aria-label={t("share.manualLabel")}
        value={url}
        style={input}
        onFocus={(e) => e.currentTarget.select()}
      />
    </label>
  );
}
