"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { dedupeBy } from "./helpers";
import { s, CHIP_TONE } from "./styles";

interface ImpactChipsProps {
  items: readonly string[];
  tone: "endpoint" | "cron";
  label: string;
}

/** Presentational chip list: endpoints (blue, globe) or crons (warn, clock). */
export function ImpactChips({ items, tone, label }: ImpactChipsProps) {
  const unique = dedupeBy(items, (i) => i);
  if (unique.length === 0) return null;
  const I = tone === "endpoint" ? Icon.Globe : Icon.Clock;
  return (
    <div style={s.chipRow} role="group" aria-label={label}>
      {unique.map((item) => (
        <span key={item} className="mono" style={{ ...s.chip, ...CHIP_TONE[tone] }}>
          <I size={12} />
          {item}
        </span>
      ))}
    </div>
  );
}
