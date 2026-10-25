"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { relativeTime, TYPE_COLORS } from "../../helpers";
import { s } from "./styles";

/** Selectable list of repo docs with type badge and token estimate per row. */
export function DocList({
  docs,
  selected,
  onSelect,
  scannedAt,
  totalFound,
  truncated,
}: {
  docs: ContextDoc[];
  selected: string | null;
  onSelect: (path: string) => void;
  scannedAt: string;
  totalFound: number;
  truncated: boolean;
}) {
  const t = useTranslations("context");
  const rel = relativeTime(scannedAt);
  const when = t(`time.${rel.key}`, { n: rel.n });

  return (
    <div>
      <ul style={s.list} aria-label={t("list.label")}>
        {docs.map((d) => {
          const on = d.path === selected;
          const c = TYPE_COLORS[d.type];
          return (
            <li key={d.path}>
              <button type="button" style={s.row(on)} aria-current={on ? "true" : undefined} onClick={() => onSelect(d.path)}>
                <div style={s.top}>
                  <span style={s.name}>{d.name}</span>
                  <Badge color={c.color} bg={c.bg}>
                    {t(`list.type.${d.type}`)}
                  </Badge>
                  {d.too_large ? (
                    <Badge>{t("list.tooLarge")}</Badge>
                  ) : (
                    <span style={s.tokens}>{t("list.tokens", { count: d.tokens })}</span>
                  )}
                </div>
                <div className="mono" style={s.path} title={d.path}>
                  {d.path}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div style={s.footer}>
        {truncated && <div>{t("list.truncated", { shown: docs.length, total: totalFound })}</div>}
        <div>{t("list.footer", { count: docs.length, when })}</div>
      </div>
    </div>
  );
}
