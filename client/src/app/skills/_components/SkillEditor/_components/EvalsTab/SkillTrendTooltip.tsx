/* Trend tooltip for a skill run: the shared body (skill vN, date, metrics, cost) plus the host agent (AC-83). */
"use client";

import { useTranslations } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { TrendTooltipBody } from "@/components/eval/EvalTrendChart/EvalTrendChart";
import { s } from "./styles";

export function SkillTrendTooltip({ point, hostName }: { point: EvalTrendPoint; hostName: string | null | undefined }) {
  const t = useTranslations("skills");
  return (
    <>
      <TrendTooltipBody point={point} />
      {hostName && <div style={s.hint}>{t("evals.trendHost", { name: hostName })}</div>}
    </>
  );
}
