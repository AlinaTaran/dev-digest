/* Route error boundary for /eval/**: a render-time throw shows a retry state instead of a white screen. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function EvalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState title={t("errorBoundary.title")} body={t("errorBoundary.body")} onRetry={reset} />;
}
