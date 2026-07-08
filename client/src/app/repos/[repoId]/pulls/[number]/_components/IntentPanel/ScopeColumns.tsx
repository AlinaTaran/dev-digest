"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function ScopeColumns({
  inScope,
  outOfScope,
}: {
  inScope: string[];
  outOfScope: string[];
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.scopeGrid}>
      <ScopeColumn icon="CheckCircle" label={t("inScope")} items={inScope} emptyLabel={t("noneListed")} />
      <ScopeColumn icon="XCircle" label={t("outOfScope")} items={outOfScope} emptyLabel={t("noneListed")} />
    </div>
  );
}

function ScopeColumn({
  icon,
  label,
  items,
  emptyLabel,
}: {
  icon: "CheckCircle" | "XCircle";
  label: string;
  items: string[];
  emptyLabel: string;
}) {
  const I = Icon[icon];
  return (
    <div style={s.scopeCol}>
      <div style={s.scopeHeader}>
        <I size={13} />
        <span>{label}</span>
      </div>
      {items.length > 0 ? (
        <ul style={s.bulletList}>
          {items.map((item, i) => (
            <li key={`${i}:${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <span style={s.emptyLine}>{emptyLabel}</span>
      )}
    </div>
  );
}
