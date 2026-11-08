/* Lazy-loads one run's per-case results for an expanded history row (AC-55). */
"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { EvalRunDetails } from "@/components/eval/EvalRunDetails/EvalRunDetails";
import { useEvalRun } from "@/lib/hooks/eval";
import { s } from "./styles";

export function EvalRunDetailsLoader({ runId }: { runId: string }) {
  const t = useTranslations("eval");
  const { data, isError } = useEvalRun(runId);
  if (isError) return <div style={s.detailsError}>{t("agentDashboard.loadError")}</div>;
  if (!data) return <Skeleton height={48} />;
  return <EvalRunDetails detail={data} />;
}
