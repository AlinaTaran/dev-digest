/* Error boundary for the Onboarding Tour route — a render throw in a section
   recovers here instead of taking down the whole app. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

const wrap: React.CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

export default function OnboardingTourError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={wrap}>
      <ErrorState title={t("errorBoundary.title")} body={t("errorBoundary.body")} onRetry={reset} />
    </div>
  );
}
