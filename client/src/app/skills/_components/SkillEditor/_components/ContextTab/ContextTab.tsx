"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextListing, useSkillContext, usePutSkillContext } from "@/lib/hooks/context";
import { ContextAttachPanel } from "@/components/project-context-attach/ContextAttachPanel";

/** Context tab — attach repo docs to the skill; agents using the skill inherit them. */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const listing = useContextListing(repoId);
  const ctx = useSkillContext(skill.id, repoId);
  const put = usePutSkillContext();

  return (
    <ContextAttachPanel
      title={t("context.title")}
      hint={t("context.hint")}
      listing={listing}
      context={ctx}
      put={put}
      compactPreview
      compactCounter
      onChange={(repo_id, paths) => put.mutate({ skillId: skill.id, repo_id, paths })}
      serialized={ctx.data ? { label: t("context.serializesAs"), text: ctx.data.serialized } : undefined}
    />
  );
}
