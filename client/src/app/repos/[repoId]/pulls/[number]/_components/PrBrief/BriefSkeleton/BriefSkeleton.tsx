"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { s } from "../styles";

export function BriefSkeleton() {
  const t = useTranslations("brief");
  return (
    <div role="status" aria-label={t("prBrief.generating")} style={s.skeletonStack}>
      <div aria-hidden="true" style={s.skeletonStack}>
        <Skeleton height={16} />
        <Skeleton height={16} width="80%" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={`risk-${i}`} aria-hidden="true">
          <Skeleton height={34} />
        </div>
      ))}
      {[0, 1].map((i) => (
        <div key={`focus-${i}`} aria-hidden="true">
          <Skeleton height={14} width="70%" />
        </div>
      ))}
    </div>
  );
}
