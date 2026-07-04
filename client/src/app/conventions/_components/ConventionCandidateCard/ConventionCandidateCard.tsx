"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { CopyButton } from "../CopyButton/CopyButton";
import { confidenceColor, evidenceLineSuffix } from "./helpers";
import { s } from "./styles";

/** One extracted convention candidate — evidence, confidence, accept/reject,
    and an inline rule edit. Adapted from FindingCard's colocation pattern
    (constants/helpers/styles siblings, accept/dismiss Button pair). */
export function ConventionCandidateCard({
  candidate,
  repoId,
}: {
  candidate: ConventionCandidate;
  repoId: string | null | undefined;
}) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);
  const [editing, setEditing] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(candidate.rule);

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  // Only one accept/reject mutation can be in flight per card; use the last
  // mutation's variables to tell which action ("accept" vs "reject") is the
  // one currently pending, instead of tracking a duplicate local flag.
  const pendingStatus = update.isPending ? update.variables?.patch.status : undefined;
  const pct = Math.round(candidate.confidence * 100);

  const commitRule = () => {
    setEditing(false);
    const trimmed = ruleDraft.trim();
    if (trimmed && trimmed !== candidate.rule) {
      update.mutate({ id: candidate.id, patch: { rule: trimmed } });
    } else {
      setRuleDraft(candidate.rule);
    }
  };

  return (
    <div style={s.card(accepted, rejected)}>
      <div style={s.header}>
        <div style={s.titleWrap}>
          {editing ? (
            <input
              autoFocus
              className="mono"
              value={ruleDraft}
              onChange={(e) => setRuleDraft(e.target.value)}
              onBlur={commitRule}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRule();
                if (e.key === "Escape") {
                  setRuleDraft(candidate.rule);
                  setEditing(false);
                }
              }}
              aria-label={t("card.editRule")}
              style={s.ruleInput}
            />
          ) : (
            <span style={s.title}>{candidate.rule}</span>
          )}
          {!editing && (
            <IconBtn
              icon="Edit"
              label={t("card.editRule")}
              size={22}
              onClick={() => {
                setRuleDraft(candidate.rule);
                setEditing(true);
              }}
            />
          )}
          <span style={s.category}>{candidate.category}</span>
        </div>
        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Check"
            active={accepted}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: candidate.id, patch: { status: "accepted" } })}
          >
            {pendingStatus === "accepted" ? t("card.accepting") : t("card.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            active={rejected}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: candidate.id, patch: { status: "rejected" } })}
          >
            {pendingStatus === "rejected" ? t("card.rejecting") : t("card.reject")}
          </Button>
        </div>
      </div>

      <div style={s.codeBox}>
        <div style={s.codeBoxHeader}>
          <MonoLink>
            {candidate.evidence_path}
            {evidenceLineSuffix(candidate)}
          </MonoLink>
          <CopyButton text={candidate.evidence_snippet} />
        </div>
        <pre className="mono" style={s.snippet}>
          {candidate.evidence_snippet}
        </pre>
      </div>

      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBar}>
          <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
        </div>
        <span className="mono tnum" style={s.confidencePct}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
