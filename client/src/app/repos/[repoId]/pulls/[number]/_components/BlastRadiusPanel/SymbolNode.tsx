"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink } from "@devdigest/ui";
import type { BlastDownstreamEntry } from "@/lib/types";
import { ImpactChips } from "./ImpactChips";
import { callerHref, dedupeBy } from "./helpers";
import { s } from "./styles";

interface SymbolNodeProps {
  entry: BlastDownstreamEntry;
  expanded: boolean;
  onToggle: () => void;
  repoFullName: string | null;
  indexedSha: string | null;
  headSha: string;
  maxCallers: number;
}

export function SymbolNode({
  entry,
  expanded,
  onToggle,
  repoFullName,
  indexedSha,
  headSha,
  maxCallers,
}: SymbolNodeProps) {
  const t = useTranslations("blast");
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
  const callers = dedupeBy(entry.callers, (c) => `${c.file}:${c.line}:${c.name}`);

  return (
    <div style={s.node}>
      <div style={s.nodeRow}>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={expanded}
          aria-label={t(expanded ? "collapse" : "expand", { name: entry.symbol })}
          onClick={onToggle}
        >
          <Chevron size={16} />
        </button>
        <Icon.Code size={14} style={s.symbolIcon} />
        <span className="mono" style={s.symbolName}>{`${entry.symbol}()`}</span>
        <span style={s.spacer} />
        <span style={s.callerCount}>{t("callerCount", { count: entry.callers_total })}</span>
      </div>

      {expanded && (
        <div style={s.children}>
          {callers.length === 0 && <p style={s.muted}>{t("noCallers")}</p>}
          {callers.map((c) => {
            const location = `${c.file}:${c.line}`;
            return (
              <div key={`${location}:${c.name}`} style={s.caller}>
                <Icon.CornerDownRight size={12} />
                <MonoLink href={callerHref(repoFullName, indexedSha, headSha, c.file, c.line)}>
                  {location}
                </MonoLink>
                <span>{c.name}</span>
              </div>
            );
          })}
          {entry.truncated && (
            <p style={s.muted}>
              {t("showingFirst", { shown: callers.length, total: entry.callers_total, max: maxCallers })}
            </p>
          )}
          <ImpactChips items={entry.endpoints_affected} tone="endpoint" label={t("endpoints")} />
          <ImpactChips items={entry.crons_affected} tone="cron" label={t("crons")} />
        </div>
      )}
    </div>
  );
}
