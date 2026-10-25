import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { agoParts, repoName } from "../../helpers";

const wrap: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 22, fontWeight: 700, margin: 0 };
const subtitle: React.CSSProperties = { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 0" };
const toolbar: React.CSSProperties = { marginLeft: "auto", display: "flex", gap: 8 };
const reason: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, display: "flex", gap: 8, alignItems: "center" };

export interface HeaderProps {
  repoFullName: string;
  filesIndexed: number;
  generatedAt: string;
  generating: boolean;
  /** Visible reason Regenerate is disabled for availability (not generation) reasons. */
  blockedReason: string | null;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onShare: () => void;
  onResync: (() => void) | null;
  resyncLabel: string;
  resyncing: boolean;
}

export function Header(p: HeaderProps) {
  const t = useTranslations("onboarding");
  const ago = agoParts(p.generatedAt);
  return (
    <div>
      <div style={wrap}>
        <div>
          <h1 style={title}>{t("heading", { name: repoName(p.repoFullName) })}</h1>
          <p style={subtitle}>
            {t("subtitle", { count: p.filesIndexed.toLocaleString("en-US"), ago: t(`ago.${ago.unit}`, { count: ago.count }) })}
          </p>
        </div>
        <div style={toolbar}>
          <Button icon="RefreshCw" disabled={!p.canRegenerate} onClick={p.onRegenerate}>
            {p.generating ? t("regenerating") : t("regenerate")}
          </Button>
          <Button icon="Link" onClick={p.onShare}>
            {t("shareLink")}
          </Button>
        </div>
      </div>
      {p.blockedReason && (
        <div style={reason}>
          <span>{p.blockedReason}</span>
          {p.onResync && (
            <Button size="sm" disabled={p.resyncing} onClick={p.onResync}>
              {p.resyncLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
