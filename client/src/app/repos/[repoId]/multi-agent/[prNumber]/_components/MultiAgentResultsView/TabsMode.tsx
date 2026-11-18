/* Tabs mode — one tab per agent with an agent card and FindingCards (AC-44..47). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, Skeleton } from "@devdigest/ui";
import type { AgentColumn, FindingGroup, FindingActionKind } from "@devdigest/shared";
import { FindingCard } from "../../../../pulls/[number]/_components/FindingCard/FindingCard";
import { formatCost } from "@/lib/format";
import { agentIcon, alsoFoundBy, columnAccent, formatSeconds, scoreColor, tintedBorder } from "./helpers";
import { StatusChip } from "./StatusChip";
import { s } from "./styles";

function LearnButton() {
  const t = useTranslations("multiAgentResults");
  const hintId = React.useId();
  return (
    <>
      <button type="button" disabled aria-describedby={hintId} style={{ opacity: 0.5, fontSize: 12 }}>
        {t("finding.learn")}
      </button>
      <span id={hintId} style={s.learnHint}>
        {t("finding.learnHint")}
      </span>
    </>
  );
}

export function TabsMode({
  columns,
  groups,
  active,
  onSelect,
  onViewTrace,
  onAction,
  pending,
  repoFullName,
  headSha,
}: {
  columns: AgentColumn[];
  groups: FindingGroup[];
  active: AgentColumn | null;
  onSelect: (runId: string) => void;
  onViewTrace: (runId: string) => void;
  onAction: (findingId: string, action: "accept" | "dismiss") => void;
  pending: boolean;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const t = useTranslations("multiAgentResults");
  if (!active) return null;
  const accent = columnAccent(active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="tablist" style={s.tabStrip}>
        {columns.map((c) => {
          const on = c.run_id === active.run_id;
          const I = Icon[agentIcon(c.agent_name)];
          return (
            <button
              key={c.run_id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(c.run_id)}
              style={{ ...s.tab, ...(on ? s.tabOn : null) }}
            >
              <I size={14} style={{ color: on ? "var(--accent)" : "var(--text-muted)" }} aria-hidden />
              {t("column.tabLabel", { name: c.agent_name })}
              {c.status === "done" && c.score != null && (
                <span className="tnum" style={{ ...s.tabScore, color: scoreColor(c.score) }}>
                  {c.score}
                </span>
              )}
              {c.status !== "done" && <StatusChip status={c.status} />}
            </button>
          );
        })}
      </div>

      <div style={{ ...s.agentCard, borderColor: tintedBorder(accent) }}>
        {active.status === "done" && active.score != null && <CircularScore score={active.score} size={48} />}
        <div style={s.agentBody}>
          <div style={s.columnHead}>
            <span style={{ ...s.agentTitle, color: accent }}>{active.agent_name}</span>
            <StatusChip status={active.status} />
            {active.status === "done" && (
              <span style={s.meta}>
                {t("column.score", { score: active.score ?? "—" })}
              </span>
            )}
          </div>
          {active.summary && <p style={s.summaryText}>{active.summary}</p>}
          {active.status === "running" && (
            <div style={s.reviewing} role="status">
              <span>{t("column.reviewing")}</span>
              <Skeleton height={10} width="60%" />
            </div>
          )}
          {(active.status === "failed" || active.status === "cancelled") && (
            <div style={active.status === "failed" ? s.error : s.muted}>{active.error ?? t("column.noReason")}</div>
          )}
        </div>
        <div style={s.traceBlock}>
          <button type="button" style={s.traceLink} onClick={() => onViewTrace(active.run_id)}>
            {t("column.viewTrace")}
          </button>
          <span style={s.metaMono}>
            {t("column.duration", { seconds: formatSeconds(active.duration_ms) })} · {formatCost(active.cost_usd)}
          </span>
        </div>
      </div>

      {active.status === "done" && active.findings.length === 0 && (
        <div style={s.clean}>
          <Icon.CheckCircle size={14} aria-hidden />
          {t("column.noFindings")}
        </div>
      )}
      <div style={s.list}>
        {active.findings.map((f) => {
          const others = alsoFoundBy(f, active, groups, columns);
          return (
            <div key={f.id}>
              <FindingCard
                f={f}
                pending={pending}
                repoFullName={repoFullName}
                headSha={headSha}
                onAction={(a: FindingActionKind) => {
                  if (a === "accept" || a === "dismiss") onAction(f.id, a);
                }}
                extraActions={<LearnButton />}
              />
              {others.length > 0 && (
                <div style={s.alsoFound}>{t("finding.alsoFoundBy", { agents: others.join(", ") })}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
