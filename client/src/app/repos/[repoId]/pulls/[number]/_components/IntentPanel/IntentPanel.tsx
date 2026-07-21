"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Button, Skeleton, ErrorState } from "@devdigest/ui";
import { useIntent, useRecomputeIntent } from "@/lib/hooks";
import { ScopeColumns } from "./ScopeColumns";
import { RiskChips } from "./RiskChips";
import { s } from "./styles";

export function IntentPanel({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const query = useIntent(prId);
  const recompute = useRecomputeIntent(prId);
  // `isLoading` (not `isPending`) so a disabled query (prId === null) doesn't sit
  // in the skeleton forever, and a recompute keeps the current card visible while
  // the header button shows its own spinner.
  const loading = query.isLoading;

  return (
    <Card>
      <SectionLabel
        icon="Target"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            {t("recompute")}
          </Button>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      {loading ? (
        <div style={s.skeletonStack}>
          <Skeleton height={16} width="70%" />
          <div style={s.scopeGrid}>
            <div style={s.scopeCol}>
              <Skeleton height={12} width="40%" />
              <Skeleton height={12} width="90%" />
              <Skeleton height={12} width="80%" />
            </div>
            <div style={s.scopeCol}>
              <Skeleton height={12} width="40%" />
              <Skeleton height={12} width="90%" />
              <Skeleton height={12} width="80%" />
            </div>
          </div>
        </div>
      ) : query.isError ? (
        <ErrorState
          title={t("error.title")}
          body={t("error.body")}
          onRetry={() => query.refetch()}
        />
      ) : query.data ? (
        <>
          <p style={s.quote}>{query.data.intent}</p>
          <ScopeColumns inScope={query.data.in_scope} outOfScope={query.data.out_of_scope} />
          <RiskChips risks={query.data.risks} />
        </>
      ) : null}
    </Card>
  );
}
