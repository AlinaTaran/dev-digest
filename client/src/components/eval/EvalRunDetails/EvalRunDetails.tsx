/* Per-case breakdown of one suite run (AC-55). All model/case text is plain text (AC-71). */
"use client";

import { useTranslations } from "next-intl";
import type { EvalCaseResult, EvalCaseView, EvalExpectation, EvalRunDetail } from "@devdigest/shared";
import { formatCost } from "@/lib/format";
import { s } from "./styles";

export interface EvalRunDetailsProps {
  detail: EvalRunDetail;
  /** Cases of the owner, used to name unmatched expectations (falls back to "#n"). */
  cases?: EvalCaseView[];
}

const expectationLabel = (e: EvalExpectation): string =>
  `${e.file}:${e.start_line}${e.title ? ` — ${e.title}` : ""}`;

function CaseRow({ r, expected }: { r: EvalCaseResult; expected: EvalExpectation[] | undefined }) {
  const t = useTranslations("eval");
  const out = r.actual_output;
  const kind = r.error ? "error" : r.pass ? "pass" : "fail";
  const unmatched = out.expectations.filter((x) => !x.matched);
  const fps = out.finding_verdicts.filter((v) => v.verdict === "fp");
  const titleOf = (id: string) => out.kept.find((f) => f.id === id)?.title ?? id;

  return (
    <tr>
      <td style={s.td}>
        <div style={s.name}>{r.case_name}</div>
        {!r.error && (
          <div style={s.muted}>{t("evalsTab.subtitleExpected", { expected: r.expected_count, got: r.got_count })}</div>
        )}
        {unmatched.length > 0 && (
          <>
            <div style={s.subHeading}>{t("runDetails.unmatchedHeading")}</div>
            <ul style={s.list}>
              {unmatched.map((u) => {
                const exp = expected?.[u.index];
                return <li key={u.index}>{exp ? expectationLabel(exp) : `#${u.index + 1}`}</li>;
              })}
            </ul>
          </>
        )}
        {fps.length > 0 && (
          <>
            <div style={s.subHeading}>{t("runDetails.falsePositivesHeading")}</div>
            <ul style={s.list}>
              {fps.map((v) => (
                <li key={v.finding_id}>{titleOf(v.finding_id)}</li>
              ))}
            </ul>
          </>
        )}
        {out.dropped.length > 0 && (
          <>
            <div style={s.subHeading}>{t("runDetails.droppedHeading")}</div>
            <ul style={s.list}>
              {out.dropped.map((d, i) => (
                <li key={`${d.finding.id}-${i}`}>
                  {d.finding.title} · {d.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </td>
      <td style={s.td}>
        <span style={s.result(kind)}>
          {r.error
            ? t("runDetails.error", { reason: t(`runDetails.errorReason.${r.error.reason}`) })
            : t(r.pass ? "dashboard.pass" : "dashboard.fail")}
        </span>
      </td>
      <td style={s.td} className="tnum">
        {r.duration_ms == null ? "—" : `${(r.duration_ms / 1000).toFixed(1)}s`}
      </td>
      <td style={s.td} className="tnum">
        {formatCost(r.cost_usd)}
      </td>
    </tr>
  );
}

export function EvalRunDetails({ detail, cases }: EvalRunDetailsProps) {
  const t = useTranslations("eval");
  const byId = new Map((cases ?? []).map((c) => [c.id, c.expected_output]));
  return (
    <div style={s.wrap}>
      {detail.eval_run.error_reason === "interrupted" && <div style={s.runError}>{t("runDetails.runErrorInterrupted")}</div>}
      {detail.results.length === 0 ? (
        <div style={s.empty}>{t("runDetails.noResults")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("runDetails.caseColumn")}</th>
              <th style={s.th}>{t("runDetails.resultColumn")}</th>
              <th style={s.th}>{t("runDetails.durationColumn")}</th>
              <th style={s.th}>{t("runDetails.costColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {detail.results.map((r) => (
              <CaseRow key={r.id} r={r} expected={byId.get(r.case_id)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
