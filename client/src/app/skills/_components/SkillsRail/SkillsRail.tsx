/* SkillsRail — left rail shared by /skills and /skills/:id: filter input,
   "Add Skill" menu (create from scratch / import from file), and the card
   list. Owns its own create/import overlay state so both routes get modals
   and the drawer for free, mirroring how AgentsListView owns `creating`. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { CreateSkillModal } from "../CreateSkillModal/CreateSkillModal";
import { ImportSkillDrawer } from "../ImportSkillDrawer/ImportSkillDrawer";
import { SkillCard } from "./SkillCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsRail({ activeId }: { activeId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);

  return (
    <div style={s.rail}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      <div style={s.headerBlock}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={100} style={s.cardSkeleton} />
            <Skeleton height={100} style={s.cardSkeleton} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}?tab=config`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
