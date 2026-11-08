/* Lazy-loads one run's per-case results for an expanded history row (AC-55). */
"use client";

import { useTranslations } from "next-intl";
import type { EvalCaseView } from "@devdigest/shared";
import { EvalRunDetails } from "@/components/eval/EvalRunDetails/EvalRunDetails";
import { useEvalRun } from "@/lib/hooks/eval";
import { s } from "./styles";

export function EvalRunDetailsLoader({ runId, cases }: { runId: string; cases: EvalCaseView[] }) {
  const t = useTranslations("agents");
  const { data, isError } = useEvalRun(runId);
  if (isError) return <div style={s.error}>{t("editor.evals.detailsError")}</div>;
  if (!data) return <div style={s.muted}>{t("editor.evals.detailsLoading")}</div>;
  return <EvalRunDetails detail={data} cases={cases} />;
}
