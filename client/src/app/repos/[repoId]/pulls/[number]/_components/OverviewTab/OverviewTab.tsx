"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { IntentPanel } from "../IntentPanel/IntentPanel";
import { BlastRadiusPanel } from "../BlastRadiusPanel/BlastRadiusPanel";
import { usePrBriefBlock } from "../PrBrief/PrBriefBlock/usePrBriefBlock";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string;
  blastView: "tree" | "graph";
  onBlastViewChange: (view: "tree" | "graph") => void;
  latestVerdictReview: ReviewRecord | null;
  onNavigateToDiff: (file: string, line?: number) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  blastView,
  onBlastViewChange,
  latestVerdictReview,
  onNavigateToDiff,
}: OverviewTabProps) {
  const brief = usePrBriefBlock({ prId, latestVerdictReview, onNavigateToDiff });
  return (
    <>
      <section>
        {brief.header}
        {brief.top}
      </section>

      <div style={s.topGrid}>
        <IntentPanel prId={prId} footer={brief.riskAreas} />
        <BlastRadiusPanel
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          headSha={headSha}
          view={blastView}
          onViewChange={onBlastViewChange}
        />
      </div>

      {brief.reviewFocus}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
