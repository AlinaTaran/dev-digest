/* /skills/:id — Skill Editor. Left skills rail + header (name, type badge,
   source badge, enabled state) + SkillEditor. Mirrors agents/[id]/page.tsx.
   Tab state lives in ?tab=. */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillsRail } from "../_components/SkillsRail/SkillsRail";
import { typeColor } from "../_components/SkillsRail/helpers";
import { SkillEditor } from "../_components/SkillEditor/SkillEditor";
import { VALID_TABS } from "../_components/SkillEditor/constants";
import { useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const t = useTranslations("skills");

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={notFound ? t("detail.notFound.title") : t("detail.loadErrorTitle")}
          body={
            notFound ? t("detail.notFound.body") : error instanceof ApiError ? error.message : t("detail.loadError")
          }
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <SkillsRail activeId={id} />

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color={typeColor(skill.type)}>{t(`listItem.type.${skill.type}`)}</Badge>
              <Badge color="var(--text-secondary)" mono icon="GitBranch">
                {t("preview.version", { version: skill.version })}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
