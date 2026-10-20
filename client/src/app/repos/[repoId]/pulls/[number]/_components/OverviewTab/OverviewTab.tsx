"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "../IntentPanel/IntentPanel";
import { BlastRadiusPanel } from "../BlastRadiusPanel/BlastRadiusPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string;
  blastView: "tree" | "graph";
  onBlastViewChange: (view: "tree" | "graph") => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  blastView,
  onBlastViewChange,
}: OverviewTabProps) {
  return (
    <>
      <div style={s.topGrid}>
        <IntentPanel prId={prId} />
        <BlastRadiusPanel
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          headSha={headSha}
          view={blastView}
          onViewChange={onBlastViewChange}
        />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
