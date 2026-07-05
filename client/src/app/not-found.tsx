/* 404 boundary — rendered for unmatched routes and notFound() calls. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

export default function NotFound() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <div style={wrap}>
      <EmptyState
        icon="Search"
        title={t("notFound.title")}
        body={t("notFound.body")}
        cta={t("notFound.home")}
        onCta={() => router.push("/")}
      />
    </div>
  );
}
