/* "Compare runs · vA → vB" (older → newer by started_at): metric tiles old → new with deltas,
   case-set change note, prompt diff or "unchanged", and config differences. */
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { caseSetChange, hostAgentsDiffer, orderRuns, snapshotDifferences } from "@/lib/eval/compare";
import { cost2, costDelta2, deltaPoints, pct } from "@/lib/eval/format";
import { isWordDiffUnchanged, wordDiff } from "@/lib/eval/word-diff";
import { PromptDiffView } from "../PromptDiffView/PromptDiffView";
import { s } from "./styles";

export interface CompareRunsModalProps {
  a: EvalSuiteRun;
  b: EvalSuiteRun;
  onClose: () => void;
  /** Extra footer content next to Close (the Promote button, T11). */
  footerExtra?: ReactNode;
  /** `skill` compares the tested skill body instead of the agent prompt and warns on differing host agents. */
  mode?: "agent" | "skill";
}

type Metric = "recall" | "precision" | "citation_accuracy";
const TILES: { key: Metric; label: "recall" | "precision" | "citation"; color: string }[] = [
  { key: "recall", label: "recall", color: "var(--accent)" },
  { key: "precision", label: "precision", color: "var(--ok)" },
  { key: "citation_accuracy", label: "citation", color: "var(--warn)" },
];

const promptOf = (run: EvalSuiteRun, mode: "agent" | "skill"): string =>
  mode === "skill" ? (run.config_snapshot.skill_body ?? "") : run.config_snapshot.system_prompt;

export function CompareRunsModal({ a, b, onClose, footerExtra, mode = "agent" }: CompareRunsModalProps) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const [older, newer] = orderRuns(a, b);
  const om = older.metrics;
  const nm = newer.metrics;
  const change = caseSetChange(older.case_ids, newer.case_ids);
  const diffs = snapshotDifferences(older, newer, mode);
  const promptChanged = !isWordDiffUnchanged(wordDiff(promptOf(older, mode), promptOf(newer, mode)));
  const hostsDiffer = mode === "skill" && hostAgentsDiffer(older, newer);
  const hostName = (r: EvalSuiteRun) => r.host_agent_name ?? r.config_snapshot.agent_name ?? t("hostAgent.unknown");
  const costChange = costDelta2(nm?.cost_usd, om?.cost_usd);

  return (
    <Modal
      width={960}
      title={t("compareModal.title", { a: older.owner_version, b: newer.owner_version })}
      subtitle={t("compareModal.subtitle", { n: newer.case_ids.length })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {tc("actions.close")}
          </Button>
          {footerExtra}
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.tiles}>
          {TILES.map(({ key, label, color }) => {
            const d = om && nm ? deltaPoints(nm[key], om[key]) : null;
            return (
              <div key={key} style={s.tile} role="group" aria-label={t(`tiles.${label}`)}>
                <div style={s.label}>{t(`tiles.${label}`)}</div>
                <div style={s.values}>
                  <span style={s.old}>{pct(om?.[key])}</span>
                  <Icon.ArrowRight size={13} aria-hidden="true" style={s.arrow} />
                  <span style={{ ...s.next, color }}>{pct(nm?.[key])}</span>
                  {d && (
                    <span style={s.delta(d.direction)} aria-label={d.direction === "flat" ? t("tiles.deltaNone") : t(d.direction === "up" ? "tiles.deltaUp" : "tiles.deltaDown", { n: Math.abs(d.points) })}>
                      {d.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div style={s.tile} role="group" aria-label={t("history.columns.cost")}>
            <div style={s.label}>{t("history.columns.cost").toUpperCase()}</div>
            <div style={s.values}>
              <span style={s.old}>{cost2(om?.cost_usd)}</span>
              <Icon.ArrowRight size={13} aria-hidden="true" style={s.arrow} />
              <span style={s.next}>{cost2(nm?.cost_usd)}</span>
              {costChange && (
                <span style={s.delta(costChange.direction)}>
                  {costChange.direction === "up" ? "▲ " : costChange.direction === "down" ? "▼ " : ""}
                  {costChange.text}
                </span>
              )}
            </div>
          </div>
        </div>

        {hostsDiffer && (
          <div role="alert" style={s.note}>
            {t("hostAgent.warning", { a: hostName(older), b: hostName(newer) })}
          </div>
        )}

        {(change.added.length > 0 || change.removed.length > 0) && (
          <div role="note" style={s.note}>
            {t("compareModal.caseSetChanged", { added: change.added.length, removed: change.removed.length })}
          </div>
        )}

        {promptChanged ? (
          <div>
            <h4 style={s.heading}>
              <Icon.FileText size={14} aria-hidden="true" />
              {t(mode === "skill" ? "compareModal.skillBodyDiff" : "compareModal.systemPromptDiff")}
            </h4>
            <div style={s.legend}>
              <span style={s.legendItem}>
                <span style={s.swatch("var(--code-del)")} />
                {t("compareModal.legendOld", { v: t("history.version", { n: older.owner_version }) })}
              </span>
              <span style={s.legendItem}>
                <span style={s.swatch("var(--code-add)")} />
                {t("compareModal.legendNew", { v: t("history.version", { n: newer.owner_version }) })}
              </span>
            </div>
            <PromptDiffView
              before={promptOf(older, mode)}
              after={promptOf(newer, mode)}
              label={t(mode === "skill" ? "compareModal.skillBodyDiff" : "compareModal.systemPromptDiff")}
            />
          </div>
        ) : (
          <div style={s.note}>
            <div>{t(mode === "skill" ? "compareModal.skillBodyUnchanged" : "compareModal.systemPromptUnchanged")}</div>
            {diffs.length === 0 && <div>{t("compareModal.noConfigChanges")}</div>}
          </div>
        )}

        {diffs.length > 0 && (
          <ul style={s.list}>
            {diffs.map((d) => (
              <li key={d.field}>
                {d.field === "host_prompt"
                  ? t("compareModal.field.host_prompt")
                  : `${t(`compareModal.field.${d.field}`)}: ${t("compareModal.change", { from: d.from || "—", to: d.to || "—" })}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
