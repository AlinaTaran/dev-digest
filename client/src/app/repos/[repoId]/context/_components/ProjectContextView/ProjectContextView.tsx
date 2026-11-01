/* Project Context — browse, preview and edit the repo's Markdown docs that can
   be attached to agents and skills. Data: GET /repos/:id/context (+ /reindex). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextListing, useReindexContext } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocList } from "./_components/DocList/DocList";
import { DocPanel } from "./_components/DocPanel/DocPanel";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { s } from "./styles";

const GLOBS_HREF = "/settings/project-context";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: listing, isLoading, isError, refetch } = useContextListing(repoId);
  const reindex = useReindexContext();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  useUnsavedChangesGuard(dirty, t("unsavedConfirm"));

  // Derived, not stored: until the user picks a doc, the first one in list order is shown.
  const active = selected ?? listing?.docs[0]?.path ?? null;

  const select = (path: string) => {
    if (path === active) return;
    if (dirty && !window.confirm(t("unsavedConfirm"))) return;
    setSelected(path);
  };

  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("breadcrumb") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const globs = listing?.globs.join(", ") ?? "";

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
            {listing && (
              <div style={s.globs}>
                <span className="mono">{t("globsLine", { globs })}</span>
                <Link href={GLOBS_HREF} style={s.globsLink}>
                  {t("editGlobs")}
                </Link>
              </div>
            )}
          </div>
          <div style={s.toolbar}>
            <Button icon="RefreshCw" loading={reindex.isPending} onClick={() => reindex.mutate(repoId)}>
              {reindex.isPending ? t("refreshing") : t("refresh")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div style={s.loadingStack}>
            <Skeleton height={28} />
            <Skeleton height={28} />
            <Skeleton height={28} />
          </div>
        ) : isError || !listing ? (
          <ErrorState title={t("loadError")} onRetry={() => refetch()} />
        ) : listing.degraded ? (
          <EmptyState
            icon="FileText"
            title={listing.reason === "not_cloned" ? t("empty.notClonedTitle") : t("empty.scanFailedTitle")}
            body={listing.reason === "not_cloned" ? t("empty.notClonedBody") : t("empty.scanFailedBody")}
          />
        ) : listing.docs.length === 0 ? (
          <EmptyState
            icon="FileText"
            title={t("empty.noMatchTitle")}
            body={
              <>
                {t("empty.noMatchBody", { globs })}{" "}
                <Link href={GLOBS_HREF} style={s.globsLink}>
                  {t("empty.noMatchLink")}
                </Link>
              </>
            }
          />
        ) : (
          <div style={s.body}>
            <div style={s.card}>
              <DocList
                docs={listing.docs}
                selected={active}
                onSelect={select}
                scannedAt={listing.scanned_at}
                totalFound={listing.total_found}
                truncated={listing.truncated}
              />
            </div>
            <div style={s.card}>
              {active && <DocPanel key={active} repoId={repoId} path={active} onDirtyChange={setDirty} />}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
