/* "Where agents disagree" — finding groups with per-agent cells and group actions
   (AC-52, AC-55, AC-57, AC-65, AC-69). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { TurnIntoEvalCase } from "../../../../pulls/[number]/_components/FindingCard/TurnIntoEvalCase";
import { cellsForGroup, isDecided, severityColor } from "./helpers";
import { s } from "./styles";

export function DisagreementBlock({
  groups,
  columns,
  showOnlyConflicts,
  onToggleConflicts,
  onGroupAction,
  pending,
}: {
  groups: FindingGroup[];
  columns: AgentColumn[];
  showOnlyConflicts: boolean;
  onToggleConflicts: (v: boolean) => void;
  onGroupAction: (findingIds: string[], action: "accept" | "dismiss") => void;
  pending: boolean;
}) {
  const t = useTranslations("multiAgentResults");
  const rows = showOnlyConflicts ? groups.filter((g) => g.is_conflict) : groups;
  const allFindings = columns.flatMap((c) => c.findings);

  return (
    <section style={s.disagree} aria-label={t("disagree.title")}>
      <div style={s.disagreeHead}>
        <h2 style={s.disagreeTitle}>
          <Icon.Activity size={14} aria-hidden />
          {t("disagree.title")}
        </h2>
        <label style={s.toggleLabel}>
          {t("disagree.onlyConflicts")}
          <input
            type="checkbox"
            role="switch"
            checked={showOnlyConflicts}
            onChange={(e) => onToggleConflicts(e.target.checked)}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
          />
          <span
            aria-hidden
            style={{
              ...s.switchTrack,
              background: showOnlyConflicts ? "var(--accent)" : "var(--border-strong)",
            }}
          >
            <span style={{ ...s.switchThumb, transform: showOnlyConflicts ? "translateX(16px)" : "none" }} />
          </span>
        </label>
      </div>

      {rows.length === 0 && <div style={s.muted}>{t("disagree.empty")}</div>}

      {rows.map((g) => {
        const key = g.finding_ids.join(":");
        const first = allFindings.find((f) => f.id === g.finding_ids[0]);
        return (
          <div key={key} style={s.groupRow}>
            <div style={s.groupHead}>
              <Icon.Code size={13} aria-hidden style={{ color: "var(--text-muted)" }} />
              <span style={{ ...s.findingLoc, fontSize: 12 }}>
                {g.file}:{g.start_line}
              </span>
              <span style={s.groupTitle}>{g.title}</span>
            </div>
            <div style={s.cells}>
              {cellsForGroup(g, columns).map((c) => {
                const color = c.severity ? severityColor(c.severity) : "var(--text-muted)";
                return (
                  <div key={c.agentName} style={s.cell}>
                    <span style={s.cellName}>{c.agentName}</span>
                    <span style={{ ...s.cellStatus, color: c.severity ? color : "var(--text-muted)" }}>
                      <span aria-hidden style={{ ...s.dot, background: color }} />
                      {c.severity ? t("disagree.flagged", { severity: c.severity }).toUpperCase() : t("disagree.didNotFlag")}
                    </span>
                    {c.title && <span style={s.cellNote}>{c.title}</span>}
                  </div>
                );
              })}
            </div>
            <div style={s.groupActions}>
              <Button
                kind="tertiary"
                size="sm"
                icon="Check"
                disabled={pending}
                onClick={() => onGroupAction(g.finding_ids, "accept")}
              >
                {t("disagree.accept")}
              </Button>
              <Button
                kind="tertiary"
                size="sm"
                icon="X"
                disabled={pending}
                onClick={() => onGroupAction(g.finding_ids, "dismiss")}
              >
                {t("disagree.dismiss")}
              </Button>
              {g.finding_ids[0] && (
                <TurnIntoEvalCase findingId={g.finding_ids[0]} decided={first ? isDecided(first) : false} />
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
