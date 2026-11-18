/* Configure run — /repos/:repoId/multi-agent. Pick a PR (preselected from ?pr=)
   and 2+ agents, see the estimate, launch a parallel multi-agent run. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import {
  formatCardEstimate,
  formatTotalCost,
  formatTotalDuration,
} from "@/lib/multi-agent-estimates";
import { useConfigureRun } from "./useConfigureRun";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgent");
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("configure.breadcrumb") }];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? <RepoNotFound /> : <ConfigureRunForm key={repoId} repoId={repoId} />}
    </AppShell>
  );
}

function ConfigureRunForm({ repoId }: { repoId: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const c = useConfigureRun(repoId);
  const estimateById = new Map((c.estimates ?? []).map((e) => [e.agent_id, e]));

  if (c.pulls.isLoading || c.agents.isLoading) {
    return (
      <div style={s.page}>
        <Skeleton height={28} width={260} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (c.pulls.isError || c.agents.isError) {
    return (
      <ErrorState
        fullScreen
        title={t("configure.loadError")}
        onRetry={() => {
          c.pulls.refetch();
          c.agents.refetch();
        }}
      />
    );
  }
  if (c.agentList.length === 0) {
    return (
      <EmptyState
        icon="Cpu"
        title={t("configure.noAgentsTitle")}
        body={t("configure.noAgentsBody")}
        cta={t("configure.noAgentsCta")}
        onCta={() => router.push("/agents")}
      />
    );
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>{t("configure.title")}</h1>
      <p style={s.subtitle}>{t("configure.subtitle")}</p>

      <label htmlFor="multi-agent-pr" style={s.label}>
        {t("configure.prLabel")}
      </label>
      <select
        id="multi-agent-pr"
        style={s.select}
        value={c.prNumber}
        onChange={(e) => c.setPrNumber(e.target.value)}
      >
        <option value="">{t("configure.prPlaceholder")}</option>
        {(c.pulls.data ?? []).map((p) => (
          <option key={p.number} value={String(p.number)}>
            {t("configure.prOption", { number: p.number, title: p.title })}
          </option>
        ))}
      </select>

      {!c.pr ? (
        <EmptyState
          icon="GitPullRequest"
          title={t("configure.pickPrTitle")}
          body={t("configure.pickPrBody")}
        />
      ) : (
        <>
          <div style={s.agentsHead}>
            <span style={s.label}>{t("configure.agentsLabel")}</span>
            <span>
              <Button kind="tertiary" size="sm" onClick={c.selectAll}>
                {t("configure.selectAll")}
              </Button>
              <Button kind="tertiary" size="sm" onClick={c.clear}>
                {t("configure.clear")}
              </Button>
            </span>
          </div>
          <div style={s.grid}>
            {c.agentList.map((a) => (
              <label key={a.id} style={s.card}>
                <input
                  type="checkbox"
                  checked={c.selected.includes(a.id)}
                  onChange={() => c.toggle(a.id)}
                  aria-label={a.name}
                />
                <span style={s.cardBody}>
                  <span style={s.cardName}>
                    {a.name}
                    {!a.enabled && ` (${t("configure.disabledMark")})`}
                  </span>
                  <span style={s.cardDesc}>{a.description}</span>
                  <span style={s.cardEstimate}>{formatCardEstimate(estimateById.get(a.id))}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={s.footer}>
            <Button kind="primary" disabled={!c.canLaunch} loading={c.launching} onClick={c.launch}>
              {c.selected.length >= 2
                ? t("configure.launch", { count: c.selected.length })
                : t("configure.launchIdle")}
            </Button>
            {c.selected.length >= 2 ? (
              <span style={s.total}>
                {t("estimate.total", {
                  duration: formatTotalDuration(c.total.maxMs),
                  cost: formatTotalCost(c.total.sumUsd),
                })}
              </span>
            ) : (
              <span style={s.hint}>{t("configure.minAgentsHint")}</span>
            )}
          </div>
          {c.failed && <div style={s.error}>{t("configure.startError")}</div>}
        </>
      )}
    </div>
  );
}
