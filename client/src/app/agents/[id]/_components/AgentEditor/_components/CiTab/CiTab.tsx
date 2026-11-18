/* CiTab — the agent's CI deployment: installations (repo, status, workflow version, recent runs),
   `Fail CI on`, Refresh, and the entry points of the Export-to-CI wizard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, AgentCiInstallation, CiFailOn } from "@devdigest/shared";
import { useAgentCi, useRefreshCiRuns } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { ExportCiWizard } from "../ExportCiWizard/ExportCiWizard";
import { FAIL_ON_VALUES, knownStatus, latestRuns, relativeParts, safeGithubUrl, statusColor } from "./helpers";
import { s } from "./styles";

function StatusBadge({ status }: { status: string | null }) {
  const t = useTranslations("ci");
  const known = knownStatus(status);
  return (
    <Badge dot color={statusColor(known)} bg={`color-mix(in srgb, ${statusColor(known)} 14%, transparent)`}>
      {known ? t(`ciTab.status.${known}`) : (status ?? "—")}
    </Badge>
  );
}

function RelativeTime({ iso }: { iso: string | null }) {
  const t = useTranslations("ci");
  const parts = relativeParts(iso);
  if (!parts) return <>—</>;
  return <>{t(`ciTab.time.${parts.unit}`, { n: parts.n })}</>;
}

function InstallationRow({ inst }: { inst: AgentCiInstallation }) {
  const t = useTranslations("ci");
  const [open, setOpen] = React.useState(false);
  const runs = latestRuns(inst.recent_runs);
  const last = runs[0];
  const prUrl = safeGithubUrl(inst.pr_url);
  return (
    <div style={s.row}>
      <div style={s.rowHead}>
        <button
          type="button"
          style={s.rowToggle}
          aria-expanded={open}
          aria-label={t("ciTab.toggleRow", { repo: inst.repo })}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon.GitBranch size={16} style={{ color: "var(--text-muted)" }} />
          <span className="mono" style={s.repo}>
            {inst.repo}
          </span>
          <span style={s.rowRight}>
            <span className="mono" style={s.meta}>
              {t("ciTab.workflowVersion", { version: inst.runner_version })}
            </span>
            <Badge icon="Workflow">{t("ciTab.githubActions")}</Badge>
            {last ? (
              <>
                <StatusBadge status={last.status} />
                <span style={s.meta}>
                  <RelativeTime iso={last.ran_at} />
                </span>
              </>
            ) : (
              <span style={s.meta}>{t("ciTab.noRuns")}</span>
            )}
            {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
          </span>
        </button>
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noreferrer" style={s.link}>
            {t("ciTab.viewPr")}
          </a>
        )}
      </div>
      {open && (
        <div style={s.expanded}>
          <div style={s.runsTitle}>{t("ciTab.recentRuns")}</div>
          {runs.length === 0 ? (
            <div style={s.meta}>{t("ciTab.noRecentRuns")}</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  {(["time", "pullRequest", "verdict", "findings", "status"] as const).map((c) => (
                    <th key={c} style={s.th}>
                      {t(`ciTab.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td style={s.td}>
                      <RelativeTime iso={r.ran_at} />
                    </td>
                    <td style={s.td}>{r.pr_number != null ? `#${r.pr_number}` : "—"}</td>
                    <td style={s.td}>{r.verdict ? t(`ciTab.verdict.${r.verdict}`) : "—"}</td>
                    <td style={s.td}>{r.findings_count ?? "—"}</td>
                    <td style={s.td}>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const ci = useAgentCi(agent.id);
  const update = useUpdateAgent();
  const refresh = useRefreshCiRuns();
  const refreshing = React.useRef(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  // A double click in the same tick would fire two POSTs before `isPending` re-renders.
  const onRefresh = () => {
    if (refreshing.current) return;
    refreshing.current = true;
    refresh.mutate(undefined, { onSettled: () => (refreshing.current = false) });
  };

  if (ci.isLoading) return <Skeleton height={160} />;
  if (ci.isError || !ci.data) {
    return <ErrorState title={t("ciTab.loadFailed")} onRetry={() => ci.refetch()} />;
  }
  const installations = ci.data.installations;
  const openWizard = () => setWizardOpen(true);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.heading")}</h2>
        <Badge color="var(--ok)" dot>
          {t("ciTab.activeIn", { count: installations.length })}
        </Badge>
        <div style={s.actions}>
          <Button kind="ghost" size="sm" icon="RefreshCw" onClick={onRefresh} disabled={refresh.isPending}>
            {refresh.isPending ? t("ciTab.refreshing") : t("ciTab.refresh")}
          </Button>
          {installations.length > 0 && (
            <>
              <Button kind="secondary" size="sm" icon="RefreshCw" onClick={openWizard}>
                {t("ciTab.updateConfig")}
              </Button>
              <Button kind="primary" size="sm" icon="Plus" onClick={openWizard}>
                {t("ciTab.addToCi")}
              </Button>
            </>
          )}
        </div>
      </div>

      <label style={s.failOn}>
        {t("ciTab.failOn.label")}
        <SelectInput
          value={agent.ci_fail_on}
          onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
          options={FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`ciTab.failOn.${v}`) }))}
        />
        <span style={s.hint}>{t("ciTab.failOn.hint")}</span>
      </label>

      {installations.length === 0 ? (
        <EmptyState
          icon="Workflow"
          title={t("ciTab.emptyTitle")}
          body={t("ciTab.emptyBody")}
          cta={t("ciTab.addToCi")}
          onCta={openWizard}
        />
      ) : (
        <div style={s.list}>
          {installations.map((inst) => (
            <InstallationRow key={inst.id} inst={inst} />
          ))}
          <button type="button" style={s.addRepo} onClick={openWizard}>
            <Icon.Plus size={14} />
            {t("ciTab.addRepository")}
          </button>
        </div>
      )}

      {wizardOpen && <ExportCiWizard agent={agent} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
