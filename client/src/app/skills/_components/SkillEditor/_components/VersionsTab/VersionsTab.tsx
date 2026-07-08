/* VersionsTab — history from skill_versions with a per-row Diff (against the
   current version) and Restore (POST /skills/:id/restore — the server re-applies
   the old body, which the body-change-bumps-version rule records as a fresh
   version). The diff is rendered on demand once a row's Diff button is clicked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton, ErrorState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkill, type SkillVersion } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { diffLines } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkill();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError || !versions) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  }
  if (versions.length === 0) {
    return <p style={s.empty}>{t("versions.empty")}</p>;
  }

  const sorted = [...versions].sort((x, y) => y.version - x.version);
  const newest = sorted[0]!;
  const diffFrom = diffVersion != null ? sorted.find((v) => v.version === diffVersion) : undefined;
  const ops = diffFrom ? diffLines(diffFrom.body, newest.body) : [];

  const onRestore = (v: SkillVersion) =>
    restore.mutate(
      { id: skill.id, version: v.version },
      { onSuccess: (data) => toast.success(t("versions.restored", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.headingRow}>
        <h2 style={s.h2}>{t("versions.heading")}</h2>
        <Badge>{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.list}>
        {sorted.map((v, idx) => (
          <div key={v.version} style={s.row}>
            <Badge color="var(--text-secondary)" mono icon="GitBranch">
              {t("preview.version", { version: v.version })}
            </Badge>
            <span style={s.date}>{new Date(v.created_at).toLocaleDateString()}</span>
            <div style={s.rowActions}>
              {idx === 0 ? (
                <Badge color="var(--ok)" dot>
                  {t("versions.current")}
                </Badge>
              ) : (
                <>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Eye"
                    active={diffVersion === v.version}
                    onClick={() => setDiffVersion((cur) => (cur === v.version ? null : v.version))}
                  >
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => onRestore(v)}
                    disabled={restore.isPending}
                  >
                    {t("versions.restore")}
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {diffFrom && (
        <>
          <div style={s.diffCaptionRow}>
            <h3 style={s.diffHeading}>{t("versions.diffHeading")}</h3>
            <span style={s.diffCaption}>
              {t("versions.versionOption", { version: diffFrom.version })} {t("versions.vs")}{" "}
              {t("versions.versionOption", { version: newest.version })}
            </span>
            <button style={s.diffClose} onClick={() => setDiffVersion(null)}>
              {t("versions.hideDiff")}
            </button>
          </div>
          <div style={s.diffBox}>
            {ops.map((op, i) => (
              <div key={i} className="mono" style={s.diffLine(op.type)}>
                <span style={s.diffMarker}>{op.type === "add" ? "+" : op.type === "del" ? "-" : " "}</span>
                <span>{op.text.length ? op.text : " "}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
