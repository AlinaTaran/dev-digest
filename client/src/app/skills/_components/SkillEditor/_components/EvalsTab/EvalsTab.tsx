/* EvalsTab — stub. Evals (recall/precision/citation-accuracy trace runs) are a
   later lesson; the confirmed scope for this build is a "coming soon"
   placeholder with no Run-on-evals action. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evals.comingSoonTitle")} body={t("evals.comingSoonBody")} />;
}
