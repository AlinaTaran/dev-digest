/* Eval case list: "P / T passing" header, Run-all, rows with state / subtitle / chip and
   Run / Edit / Delete (delete behind an inline confirm step). Presentational — no fetching. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalCaseView } from "@devdigest/shared";
import { caseState, caseSubtitle, firstExpectationChip, passingCount, type CaseState } from "@/lib/eval/case-state";
import { pct } from "@/lib/eval/format";
import { RunEvalButton, type RunEvalButtonProps } from "../RunEvalButton/RunEvalButton";
import { s } from "./styles";

const STATE_ICON = { passed: Icon.CheckCircle, failed: Icon.XCircle, error: Icon.AlertTriangle, never: Icon.Clock } as const;

export interface EvalCaseListProps {
  cases: EvalCaseView[];
  loading?: boolean;
  /** Props for the "Run all evals" button (disabled automatically when there are no cases). */
  runAll: RunEvalButtonProps;
  /** Case ids with a single-case run in flight. */
  runningCaseIds?: ReadonlySet<string>;
  /** Scroll to + focus this row (the `?case=` deep link). */
  highlightCaseId?: string | null;
  onRunCase: (c: EvalCaseView) => void;
  onDelete: (c: EvalCaseView) => void;
  /** Omit to hide the "New eval case" button. */
  onNew?: () => void;
  /** Omit to hide the row Edit buttons. */
  onEdit?: (c: EvalCaseView) => void;
}

function CaseRow({
  c,
  highlight,
  running,
  confirming,
  onRun,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  c: EvalCaseView;
  highlight: boolean;
  running: boolean;
  confirming: boolean;
  onRun: () => void;
  onEdit?: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!highlight) return;
    ref.current?.scrollIntoView?.({ block: "center" });
    ref.current?.focus();
  }, [highlight]);

  const last = c.last_result;
  const state: CaseState = caseState(last);
  const sub = caseSubtitle(last);
  const chip = firstExpectationChip(c.expected_output);
  const StateIcon = STATE_ICON[state];
  const stateText =
    state === "never"
      ? t("evalsTab.neverRun")
      : state === "error"
        ? t("evalsTab.subtitleError", { reason: sub.errorReason ? t(`runDetails.errorReason.${sub.errorReason}`) : "" })
        : t(state === "passed" ? "evalsTab.passed" : "evalsTab.failed");

  return (
    <li ref={ref} tabIndex={-1} style={s.row(highlight)} data-case-id={c.id} data-highlighted={highlight || undefined}>
      <span style={s.state(state)} title={stateText}>
        <StateIcon size={16} aria-hidden="true" />
      </span>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.name}>{c.name}</span>
          <span style={s.kindChip(chip.kind === "must_find")}>
            {chip.kind === "must_find" ? t("evalsTab.chipMustFind") : t("evalsTab.chipMustNotFlag")}
          </span>
        </div>
        <div style={s.subtitle}>
          <span style={s.stateText(state)}>{stateText}</span>
          {state !== "never" && state !== "error" && sub.expected != null && (
            <span style={s.muted}>
              {t("evalsTab.subtitleExpected", { expected: sub.expected, got: sub.got ?? 0 })}
              {last?.recall != null && t("evalsTab.recallSuffix", { recall: pct(last.recall).replace("%", "") })}
            </span>
          )}
        </div>
      </div>
      <span style={s.sevChip}>{chip.kind === "must_find" ? chip.label : t("evalsTab.chipAssertEmpty")}</span>
      {confirming ? (
        <div role="group" aria-label={t("evalsTab.deleteAria", { name: c.name })} style={s.confirm}>
          <span>{t("evalsTab.deleteConfirm", { name: c.name })}</span>
          <Button kind="danger" size="sm" onClick={onConfirmDelete}>
            {t("evalsTab.delete")}
          </Button>
          <Button kind="ghost" size="sm" onClick={onCancelDelete}>
            {tc("actions.cancel")}
          </Button>
        </div>
      ) : (
        <div style={s.actions}>
          <Button
            size="sm"
            kind="tertiary"
            icon="Play"
            loading={running}
            aria-label={t("evalsTab.runAria", { name: c.name })}
            title={t("evalsTab.run")}
            onClick={onRun}
          />
          {onEdit && (
            <Button
              size="sm"
              kind="tertiary"
              icon="Edit"
              aria-label={t("evalsTab.editAria", { name: c.name })}
              title={t("evalsTab.edit")}
              onClick={onEdit}
            />
          )}
          <Button
            size="sm"
            kind="tertiary"
            icon="Trash"
            aria-label={t("evalsTab.deleteAria", { name: c.name })}
            title={t("evalsTab.delete")}
            onClick={onAskDelete}
          />
        </div>
      )}
    </li>
  );
}

export function EvalCaseList({
  cases,
  loading,
  runAll,
  runningCaseIds,
  highlightCaseId,
  onRunCase,
  onDelete,
  onNew,
  onEdit,
}: EvalCaseListProps) {
  const t = useTranslations("eval");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { passed, total } = passingCount(cases);

  return (
    <section aria-label={t("evalsTab.casesHeading")}>
      <div style={s.header}>
        <h3 style={s.heading}>{t("evalsTab.casesHeading")}</h3>
        <span style={s.counter}>{t("evalsTab.counter", { passed, total })}</span>
        <span style={s.spacer} />
        {onNew && (
          <Button icon="Plus" onClick={onNew}>
            {t("caseEditor.newCase")}
          </Button>
        )}
        <RunEvalButton {...runAll} disabled={runAll.disabled || total === 0} />
      </div>
      {loading ? (
        <div style={s.empty}>{t("evalsTab.loadingCases")}</div>
      ) : total === 0 ? (
        <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              highlight={c.id === highlightCaseId}
              running={runningCaseIds?.has(c.id) ?? false}
              confirming={confirmingId === c.id}
              onRun={() => onRunCase(c)}
              onEdit={onEdit && (() => onEdit(c))}
              onAskDelete={() => setConfirmingId(c.id)}
              onCancelDelete={() => setConfirmingId(null)}
              onConfirmDelete={() => {
                setConfirmingId(null);
                onDelete(c);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
