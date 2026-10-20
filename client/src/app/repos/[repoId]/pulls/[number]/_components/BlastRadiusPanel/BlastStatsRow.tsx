"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastStats } from "@/lib/types";
import { s } from "./styles";

type View = "tree" | "graph";

const STATS = [
  { key: "symbols", icon: Icon.Code },
  { key: "callers", icon: Icon.CornerDownRight },
  { key: "endpoints", icon: Icon.Globe },
  { key: "crons", icon: Icon.Clock },
] as const;
const VIEWS: readonly View[] = ["tree", "graph"];

interface BlastStatsRowProps {
  stats: BlastStats;
  view: View;
  onViewChange: (view: View) => void;
}

export function BlastStatsRow({ stats, view, onViewChange }: BlastStatsRowProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.statsRow}>
      <div style={s.stats}>
        {STATS.map(({ key, icon: I }) => (
          <span key={key} style={s.stat}>
            <I size={14} />
            <span style={s.statNum}>{stats[key]}</span>
            {t(`stat.${key}`)}
          </span>
        ))}
      </div>
      <div style={s.toggle} role="group" aria-label={t("view.toggleLabel")}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            style={{ ...s.toggleBtn, ...(view === v ? s.toggleBtnActive : null) }}
            onClick={() => onViewChange(v)}
          >
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
