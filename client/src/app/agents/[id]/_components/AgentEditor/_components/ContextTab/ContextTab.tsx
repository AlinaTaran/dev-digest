"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextListing, useAgentContext, usePutAgentContext } from "@/lib/hooks/context";
import { ContextAttachPanel } from "@/components/project-context-attach/ContextAttachPanel";

/** Context tab — attach repo docs to the agent (ordered) and see what it inherits from its skills. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const listing = useContextListing(repoId);
  const ctx = useAgentContext(agent.id, repoId);
  const put = usePutAgentContext();

  return (
    <ContextAttachPanel
      title={t("context.title")}
      hint={t("context.hint")}
      listing={listing}
      context={ctx}
      put={put}
      onChange={(repo_id, paths) => put.mutate({ agentId: agent.id, repo_id, paths })}
    />
  );
}
