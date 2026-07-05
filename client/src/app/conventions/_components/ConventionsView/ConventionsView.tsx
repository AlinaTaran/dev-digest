/* Conventions Lab — /conventions. GLOBAL page (no :repoId in the URL); the
   active repo comes from useActiveRepo() (URL > localStorage > first repo).
   Scans the cloned repo for house-rules and lets you curate the resulting
   candidates before bundling the accepted ones into a Skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionCandidateCard } from "../ConventionCandidateCard/ConventionCandidateCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal/CreateSkillFromConventionsModal";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const { data: candidates, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const bulkUpdate = useUpdateConvention(repoId);
  const [showCreateSkill, setShowCreateSkill] = React.useState(false);
  const [isDeselecting, setIsDeselecting] = React.useState(false);

  const list = candidates ?? [];
  const acceptedCandidates = list.filter((c) => c.status === "accepted");
  const canDeselect = list.some((c) => c.status !== "pending");

  const deselectAll = async () => {
    setIsDeselecting(true);
    try {
      await Promise.allSettled(
        list
          .filter((c) => c.status !== "pending")
          .map((c) => bulkUpdate.mutateAsync({ id: c.id, patch: { status: "pending" } })),
      );
    } finally {
      setIsDeselecting(false);
    }
  };

  // Repos haven't loaded yet → render nothing rather than flashing the
  // "no repo" prompt for a moment (mirrors useRepoNotFound's own guard).
  if (!reposLoaded) {
    return <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>{null}</AppShell>;
  }

  if (!repoId) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.page}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>
              {t("page.headingPrefix")}
              <span style={s.pageTitleRepo}>{activeRepo?.name ?? t("page.repoFallback")}</span>
            </h1>
            <p style={s.pageSubtitle}>
              {candidates ? t("page.candidateCount", { count: list.length }) : t("page.scanning")}
            </p>
          </div>
          <div style={s.headerActions}>
            <Button kind="secondary" icon="RefreshCw" onClick={() => extract.mutate()} loading={extract.isPending}>
              {t("page.rescan")}
            </Button>
          </div>
        </div>

        {extract.isError && <div style={s.banner}>{t("page.extractionFailed")}</div>}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={96} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate()}
            ctaLoading={extract.isPending}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="ghost"
                size="sm"
                icon="X"
                disabled={!canDeselect || isDeselecting}
                onClick={deselectAll}
              >
                {t("toolbar.deselectAll")}
              </Button>
              <span style={s.acceptedCount}>
                {t("toolbar.acceptedCount", { accepted: acceptedCandidates.length, total: list.length })}
              </span>
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                disabled={acceptedCandidates.length === 0}
                onClick={() => setShowCreateSkill(true)}
              >
                {t("toolbar.createSkill")}
              </Button>
            </div>

            <div style={s.list}>
              {list.map((candidate) => (
                <ConventionCandidateCard key={candidate.id} candidate={candidate} repoId={repoId} />
              ))}
            </div>
          </>
        )}
      </div>

      {showCreateSkill && (
        <CreateSkillFromConventionsModal
          candidates={acceptedCandidates}
          repoName={activeRepo?.name ?? t("page.repoFallback")}
          onClose={() => setShowCreateSkill(false)}
        />
      )}
    </AppShell>
  );
}
