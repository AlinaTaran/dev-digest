/* Columns mode — one column per agent run (AC-36, AC-39, AC-40). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, Skeleton, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { formatCost } from "@/lib/format";
import { columnAccent, formatSeconds, tintedBorder } from "./helpers";
import { StatusChip } from "./StatusChip";
import { s } from "./styles";

export function ColumnsMode({
  columns,
  onViewTrace,
}: {
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  return (
    <div style={s.columns}>
      {columns.map((c) => {
        const accent = columnAccent(c);
        return (
          <section
            key={c.run_id}
            style={{ ...s.column, borderColor: tintedBorder(accent), borderTopColor: accent }}
            aria-label={c.agent_name}
          >
            <div style={s.columnHead}>
              <span style={s.agentName}>{c.agent_name}</span>
              <StatusChip status={c.status} />
            </div>
            <div style={{ ...s.meta, alignItems: "center" }}>
              <span style={s.metaMono}>
                {t("column.duration", { seconds: formatSeconds(c.duration_ms) })} · {formatCost(c.cost_usd)}
              </span>
              <span style={s.spacer} />
              <button type="button" style={s.traceLink} onClick={() => onViewTrace(c.run_id)}>
                {t("column.viewTrace")}
              </button>
            </div>

            {c.status === "running" && (
              <div style={s.reviewing} role="status">
                <span>{t("column.reviewing")}</span>
                <Skeleton height={12} />
                <Skeleton height={12} width="70%" />
              </div>
            )}

            {c.status === "done" && (
              <>
                <div style={s.meta}>
                  <span>{t("column.score", { score: c.score ?? "—" })}</span>
                  <span>{t("column.verdict", { verdict: c.verdict ?? "—" })}</span>
                </div>
                {c.findings.length === 0 ? (
                  <div style={s.clean}>
                    <Icon.CheckCircle size={14} aria-hidden />
                    {t("column.noFindings")}
                  </div>
                ) : (
                  <div style={s.list}>
                    {c.findings.map((f) => (
                      <div key={f.id} style={s.findingRow}>
                        <SeverityBadge severity={f.severity as Severity} compact />
                        <span>{f.title}</span>
                        <span style={s.findingLoc}>
                          {f.file}:{f.start_line}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {(c.status === "failed" || c.status === "cancelled") && (
              <div style={c.status === "failed" ? s.error : s.muted}>{c.error ?? t("column.noReason")}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
