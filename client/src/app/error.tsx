/* Root error boundary. Catches render-time throws anywhere below the root
   layout that no nested error.tsx handles — without it, such a throw is an
   unrecoverable white screen (hand-rolled isError branches don't catch these).
   Must be a Client Component; receives the error + a reset() to re-render. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
