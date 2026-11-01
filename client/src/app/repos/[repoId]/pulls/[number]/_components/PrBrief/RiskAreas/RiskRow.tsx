"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { BriefRisk } from "@devdigest/shared";
import { parseRefForNav } from "../helpers";
import { RISK_SEV, s } from "../styles";

/** Maps a risk's free-text `kind` to a representative icon via keyword match. */
function riskIcon(kind: string): IconName {
  const k = kind.toLowerCase();
  if (k.includes("security") || k.includes("auth")) return "Shield";
  if (k.includes("dependency") || k.includes("dep") || k.includes("package")) return "Boxes";
  if (k.includes("perf") || k.includes("performance") || k.includes("latency")) return "Zap";
  if (k.includes("migration") || k.includes("db")) return "Database";
  return "AlertTriangle";
}

export function RiskRow({
  risk,
  onOpenRef,
}: {
  risk: BriefRisk;
  onOpenRef: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const sev = RISK_SEV[risk.severity];
  const KindIcon = Icon[riskIcon(risk.kind)];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const name = t("prBrief.riskName", { severity: t(`prBrief.severity.${risk.severity}`), title: risk.title });

  return (
    <li>
      <div role="group" aria-label={name} style={s.riskRow(sev.color, sev.bg)}>
        <div style={s.riskHead}>
          <KindIcon size={14} style={{ color: sev.color, flexShrink: 0 }} aria-hidden="true" />
          <span style={s.riskTitle}>{risk.title}</span>
          <button
            type="button"
            style={s.chevron}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={t("prBrief.toggleExplanation", { title: risk.title })}
            onClick={() => setOpen((v) => !v)}
          >
            <Chevron size={14} aria-hidden="true" />
          </button>
        </div>
        <div style={s.refs}>
          {risk.file_refs.map((ref) => (
            <button
              key={ref}
              type="button"
              style={s.refBtn}
              title={ref}
              aria-label={t("prBrief.openRef", { ref })}
              onClick={() => {
                const { file, line } = parseRefForNav(ref);
                onOpenRef(file, line);
              }}
            >
              {ref}
            </button>
          ))}
        </div>
        <p id={panelId} hidden={!open} style={s.explanation}>
          {risk.explanation}
        </p>
      </div>
    </li>
  );
}
