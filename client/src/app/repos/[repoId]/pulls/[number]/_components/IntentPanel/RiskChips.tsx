"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Icon, type IconName } from "@devdigest/ui";
import type { Risk } from "@/lib/types";
import { s, RISK_SEV } from "./styles";

/** Maps a risk's free-text `kind` to a representative icon via keyword match. */
function riskIcon(kind: string): IconName {
  const k = kind.toLowerCase();
  if (k.includes("security") || k.includes("auth")) return "Shield";
  if (k.includes("dependency") || k.includes("dep") || k.includes("package")) return "Boxes";
  if (k.includes("perf") || k.includes("performance") || k.includes("latency")) return "Zap";
  if (k.includes("migration") || k.includes("db")) return "Database";
  return "AlertTriangle";
}

export function RiskChips({ risks }: { risks: Risk[] }) {
  const t = useTranslations("brief");

  return (
    <div style={s.riskSection}>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <span style={s.emptyLine}>{t("noRisks")}</span>
      ) : (
        <div style={s.riskRow}>
          {risks.map((risk) => {
            const sev = RISK_SEV[risk.severity];
            const I = Icon[riskIcon(risk.kind)];
            return (
              <span
                key={`${risk.kind}:${risk.title}`}
                title={risk.explanation}
                style={{
                  ...s.riskChip,
                  color: sev.color,
                  background: sev.bg,
                  borderColor: sev.border,
                }}
              >
                <I size={12} />
                {risk.title}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
