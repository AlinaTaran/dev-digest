"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { BriefRisk } from "@devdigest/shared";
import { RiskRow } from "./RiskRow";
import { s } from "../styles";

export function RiskAreas({
  risks,
  onOpenRef,
}: {
  risks: BriefRisk[];
  onOpenRef: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.section}>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <span style={s.emptyLine}>{t("noRisks")}</span>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskRow key={`${i}:${risk.kind}:${risk.title}`} risk={risk} onOpenRef={onOpenRef} />
          ))}
        </ul>
      )}
    </div>
  );
}
