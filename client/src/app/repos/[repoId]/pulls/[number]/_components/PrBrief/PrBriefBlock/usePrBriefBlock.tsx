"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks/brief";
import { BriefEmptyState } from "../BriefEmptyState/BriefEmptyState";
import { BriefSkeleton } from "../BriefSkeleton/BriefSkeleton";
import { BriefSummary, type BriefVerdict } from "../BriefSummary/BriefSummary";
import { BriefError } from "../BriefNotices/BriefError";
import { MissingInputsNote } from "../BriefNotices/MissingInputsNote";
import { StaleBanner } from "../BriefNotices/StaleBanner";
import { RiskAreas } from "../RiskAreas/RiskAreas";
import { ReviewFocus } from "../ReviewFocus/ReviewFocus";
import { s } from "../styles";

interface Options {
  prId: string | null;
  latestVerdictReview: ReviewRecord | null;
  onNavigateToDiff: (file: string, line?: number) => void;
}

function toBriefVerdict(review: ReviewRecord | null): BriefVerdict | null {
  if (!review?.verdict) return null;
  return {
    verdict: review.verdict,
    score: review.score,
    findingsCount: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

/** View-model for the Overview's PR Brief: nodes the Overview places itself
    (`riskAreas` goes inside the Intent card, `reviewFocus` below the top grid). */
export function usePrBriefBlock({ prId, latestVerdictReview, onNavigateToDiff }: Options) {
  const t = useTranslations("brief");
  const query = usePrBrief(prId);
  const gen = useGeneratePrBrief(prId);

  const data = query.data;
  const brief = data?.brief ?? null;
  const pending = gen.isPending || !!data?.generating;
  const noPrId = prId == null;

  const header = (
    <SectionLabel
      icon="Sparkles"
      right={
        brief ? (
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={pending}
            aria-busy={pending || undefined}
            onClick={gen.generate}
          >
            {t("prBrief.regenerate")}
          </Button>
        ) : undefined
      }
    >
      {t("block.brief")}
    </SectionLabel>
  );

  const top = (
    <div style={s.summaryStack}>
      {gen.errorReason && <BriefError reason={gen.errorReason} onRetry={gen.generate} />}
      {query.isLoading ? (
        <BriefSkeleton />
      ) : query.isError && !data ? (
        <BriefError reason="unknown" onRetry={() => query.refetch()} />
      ) : brief && data ? (
        <>
          {data.stale && (
            <StaleBanner
              briefSha={brief.meta.head_sha}
              currentSha={data.current_head_sha}
              onRegenerate={gen.generate}
              pending={pending}
            />
          )}
          <MissingInputsNote missing={brief.meta.missing_inputs} />
          <BriefSummary summary={brief.summary} verdict={toBriefVerdict(latestVerdictReview)} />
        </>
      ) : (
        <>
          <BriefEmptyState onGenerate={gen.generate} pending={pending} disabled={noPrId} />
          {pending && <BriefSkeleton />}
        </>
      )}
    </div>
  );

  const riskAreas = brief ? <RiskAreas risks={brief.risks.risks} onOpenRef={onNavigateToDiff} /> : null;
  const reviewFocus = brief ? <ReviewFocus items={brief.review_focus} onOpen={onNavigateToDiff} /> : null;

  return { header, top, riskAreas, reviewFocus };
}
