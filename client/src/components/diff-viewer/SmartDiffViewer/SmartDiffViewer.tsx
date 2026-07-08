/* SmartDiffViewer — the risk-ordered "Files changed" view. Reuses FileCard for
   every file; the only thing this component owns is grouping/ordering plus the
   per-group header. `grouped=false` renders the SAME enhanced cards flat, in
   the PR's own file order ("Original order") — the overlay richness (findings
   badges, severity chips, mechanical placeholders) is identical either way. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile, Finding, SmartDiff } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";
import type { DiffCommentApi } from "../comments";
import { FileCard } from "../FileCard/FileCard";
import { isMechanical } from "../helpers";
import { s, roleMarkerFor } from "../styles";
import { ROLE_META } from "../constants";

const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

export function SmartDiffViewer({
  smartDiff,
  files,
  findingsByPath,
  commenting,
  grouped = true,
}: {
  smartDiff: SmartDiff;
  files: PrFile[];
  findingsByPath: Map<string, Finding[]>;
  commenting?: DiffCommentApi;
  /** false renders the same cards flat, in `files` (PR) order — "Original order". */
  grouped?: boolean;
}) {
  const t = useTranslations("smart-diff");

  const filesByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const roleByPath = React.useMemo(() => {
    const map = new Map<string, SmartDiffRole>();
    for (const group of smartDiff.groups) for (const f of group.files) map.set(f.path, group.role);
    return map;
  }, [smartDiff]);

  function renderCard(path: string) {
    const file = filesByPath.get(path);
    if (!file) return null;
    const findings = findingsByPath.get(path) ?? [];
    const role = roleByPath.get(path);
    return (
      <FileCard
        key={path}
        file={file}
        commenting={commenting}
        findings={findings}
        mechanical={isMechanical(path)}
        defaultOpen={role === "core" || findings.length > 0}
        findingsLabel={findings.length > 0 ? t("findingsBadge", { count: findings.length }) : undefined}
        mechanicalPlaceholderText={t("mechanicalPlaceholder")}
      />
    );
  }

  if (!grouped) {
    return <div style={s.list}>{files.map((f) => renderCard(f.path))}</div>;
  }

  const groupsByRole = new Map(smartDiff.groups.map((g) => [g.role, g] as const));

  return (
    <div style={s.groupWrap}>
      {ROLE_ORDER.map((role) => {
        const group = groupsByRole.get(role);
        if (!group || group.files.length === 0) return null;
        const meta = ROLE_META[role];
        return (
          <div key={role}>
            <div style={s.groupHeader}>
              <span style={roleMarkerFor(meta.color)} aria-hidden="true" />
              <span style={s.groupLabel}>{t(`roles.${role}.label`)}</span>
              <span style={s.groupDescription}>{t(`roles.${role}.description`)}</span>
              <span style={s.groupCount}>{t("filesCount", { count: group.files.length })}</span>
            </div>
            <div style={s.list}>{group.files.map((f) => renderCard(f.path))}</div>
          </div>
        );
      })}
    </div>
  );
}
