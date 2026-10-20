"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Skeleton, ErrorState } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastStatsRow } from "./BlastStatsRow";
import { DegradedBanner } from "./DegradedBanner";
import { SymbolTree } from "./SymbolTree";
import { BlastGraph } from "./_components/BlastGraph/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs/PriorPrs";
import { s } from "./styles";

interface BlastRadiusPanelProps {
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string;
  view: "tree" | "graph";
  onViewChange: (view: "tree" | "graph") => void;
}

export function BlastRadiusPanel({
  prId,
  repoId,
  repoFullName,
  headSha,
  view,
  onViewChange,
}: BlastRadiusPanelProps) {
  const t = useTranslations("blast");
  const query = useBlastRadius(prId);
  const data = query.data;

  return (
    <Card>
      <SectionLabel icon="Boxes">{t("title")}</SectionLabel>

      {query.isLoading ? (
        <div style={s.skeletonStack}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : query.isError ? (
        <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => query.refetch()} />
      ) : data ? (
        <>
          <BlastStatsRow stats={data.stats} view={view} onViewChange={onViewChange} />
          {data.degraded && <DegradedBanner prId={prId} repoId={repoId} reason={data.reason} />}
          {view === "graph" ? (
            <BlastGraph data={data} />
          ) : (
            <SymbolTree key={prId} data={data} repoFullName={repoFullName} headSha={headSha} />
          )}
          <hr style={s.divider} />
          <PriorPrs prId={prId} repoFullName={repoFullName} />
        </>
      ) : null}
    </Card>
  );
}
