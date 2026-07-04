/* StatsTab — DB-derivable usage only (no pull/accept analytics): USED BY count,
   total FINDINGS, the agents linked to this skill, and findings-by-category
   across their reviews (as a donut). PULL FREQUENCY / ACCEPT RATE / 30-day
   windows from the design are intentionally omitted — there is no backing data. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, MetricCard, Donut, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

/** Category -> donut segment colour. Mirrors the app's severity/category palette;
    `perf` has no token so it uses a literal violet. */
const CAT_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#8b5cf6",
  style: "var(--accent)",
  test: "var(--ok)",
};

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={160} />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  const totalFindings = stats.findings_by_category.reduce((sum, c) => sum + c.count, 0);
  const segments = stats.findings_by_category.map((c) => ({
    label: c.category,
    value: c.count,
    color: CAT_COLOR[c.category] ?? "var(--text-muted)",
  }));

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard label={t("stats.usedByTile")} value={stats.used_by} suffix=" agents" />
        <MetricCard label={t("stats.findingsTile")} value={totalFindings} />
      </div>

      <div style={s.panels}>
        <div style={s.panel}>
          <h3 style={s.panelHeading}>{t("stats.agentsHeading")}</h3>
          {stats.agents.length === 0 ? (
            <p style={s.empty}>{t("stats.noAgents")}</p>
          ) : (
            <div style={s.agentList}>
              {stats.agents.map((a) => (
                <div key={a.id} style={s.agentRow}>
                  <Icon.Cpu size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={s.agentName}>{a.name}</span>
                  <Link href={`/agents/${a.id}?tab=config`} style={s.agentOpen}>
                    {t("stats.open")}
                    <Icon.ExternalLink size={13} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.panel}>
          <h3 style={s.panelHeading}>{t("stats.categoryHeading")}</h3>
          {segments.length === 0 ? (
            <p style={s.empty}>{t("stats.noFindings")}</p>
          ) : (
            <Donut segments={segments} format={(n) => String(n)} />
          )}
        </div>
      </div>
    </div>
  );
}
