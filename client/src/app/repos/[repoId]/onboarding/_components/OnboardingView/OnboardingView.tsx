/* Onboarding Tour — the per-repo guided tour page. Data: GET /repos/:id/onboarding
   (polled while generating) + POST /repos/:id/onboarding/generate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton, type IconName } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboarding, useOnboardingResync, useOnboardingTour } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ONBOARDING_SECTIONS, isSectionAnchor } from "@/lib/onboarding-sections";
import { SectionBody } from "../sections/SectionBody/SectionBody";
import { Banners } from "./_components/Banners/Banners";
import { TourEmptyState } from "./_components/EmptyState/TourEmptyState";
import { Header } from "./_components/Header/Header";
import { SectionCard } from "./_components/SectionCard/SectionCard";
import { ShareLinkFallback } from "./_components/ShareLinkFallback/ShareLinkFallback";
import { Toc } from "./_components/Toc/Toc";
import { scrollToSection } from "./helpers";
import { useActiveSection } from "./useActiveSection";
import { useSectionCollapse } from "./useSectionCollapse";
import { s } from "./styles";

const ANCHORS = ONBOARDING_SECTIONS.map((m) => m.anchor);
const ICONS: Record<string, IconName> = {
  architecture: "Boxes",
  "critical-paths": "Activity",
  "run-locally": "Command",
  "reading-path": "FileText",
  "first-tasks": "ListChecks",
};

export function OnboardingView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboarding();
  const resync = useOnboardingResync(repoId);
  const collapse = useSectionCollapse();
  const tour = data?.tour ?? null;
  const [activeAnchor, setActiveAnchor] = useActiveSection(ANCHORS, !!tour);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const hashHandled = React.useRef(false);

  // Deep link (AC-55): only the five known anchors are honoured; anything else is ignored.
  React.useEffect(() => {
    if (!tour || hashHandled.current) return;
    hashHandled.current = true;
    const hash = window.location.hash;
    if (!isSectionAnchor(hash)) return;
    const anchor = hash.slice(1);
    collapse.expand(anchor);
    setActiveAnchor(anchor);
    scrollToSection(anchor);
  }, [tour, collapse, setActiveAnchor]);

  const fullName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: fullName, mono: true }, { label: t("breadcrumb") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const generating = data?.generation?.status === "generating";
  const canRegenerate = !!data?.availability.can_generate && !generating && !generate.isPending;
  const startGenerate = () => generate.mutate(repoId);
  const startResync = () => resync.start();

  const selectSection = (anchor: string) => {
    collapse.expand(anchor);
    setActiveAnchor(anchor);
    scrollToSection(anchor);
    window.history.replaceState(null, "", `#${anchor}`);
  };

  const share = async () => {
    const url = `${window.location.origin}/repos/${repoId}/onboarding#${activeAnchor}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareUrl(null);
      toast.success(t("share.copied"));
    } catch {
      setShareUrl(url);
    }
  };

  const reason = data?.availability.reason ?? null;
  const blockedReason =
    reason === "not_cloned" ? t("unavailable.notCloned.body") : reason === "no_index" ? t("unavailable.noIndex.body") : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page} className="@container">
        {isLoading ? (
          <div style={s.loadingStack}>
            <Skeleton height={28} />
            <Skeleton height={28} />
            <Skeleton height={28} />
          </div>
        ) : isError || !data ? (
          <ErrorState title={t("loadError.title")} onRetry={() => refetch()} />
        ) : !tour ? (
          <TourEmptyState
            availability={data.availability}
            generation={data.generation}
            starting={generate.isPending}
            onGenerate={startGenerate}
            onResync={startResync}
            resyncing={resync.isResyncing}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[200px_minmax(0,1fr)]">
            <aside className="@3xl:sticky @3xl:top-4 @3xl:self-start">
              <Toc active={activeAnchor} onSelect={selectSection} />
            </aside>
            <div style={s.content}>
              <Header
                repoFullName={fullName}
                filesIndexed={tour.files_indexed}
                generatedAt={tour.generated_at}
                generating={generating}
                canRegenerate={canRegenerate}
                blockedReason={blockedReason}
                onRegenerate={startGenerate}
                onShare={share}
                onResync={reason === "no_index" ? startResync : null}
                resyncing={resync.isResyncing}
                resyncLabel={t("unavailable.noIndex.resync")}
              />
              {shareUrl && <ShareLinkFallback url={shareUrl} />}
              <Banners data={data} canRegenerate={canRegenerate} onRegenerate={startGenerate} />
              {tour.sections.map((section) => {
                const meta = ONBOARDING_SECTIONS.find((m) => m.kind === section.kind)!;
                return (
                  <SectionCard
                    key={meta.anchor}
                    anchor={meta.anchor}
                    title={t(meta.titleKey)}
                    icon={ICONS[meta.anchor]!}
                    open={collapse.isOpen(meta.anchor)}
                    onToggle={() => collapse.toggle(meta.anchor)}
                  >
                    <SectionBody section={section} repoFullName={fullName} sourceSha={tour.source_sha} />
                  </SectionCard>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
