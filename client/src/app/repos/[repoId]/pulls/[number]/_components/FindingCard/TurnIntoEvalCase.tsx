/* "Turn into eval case" action for an expanded FindingCard: accepted → must_find,
   dismissed → must_not_flag. Owns the mutation, the inline confirmation and the
   inline 409 message so FindingCard stays presentational. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useCreateEvalCaseFromFinding, useEvalTargets, evalCaseUnavailableReason } from "@/lib/hooks/eval";
import { s } from "./styles";

export function TurnIntoEvalCase({ findingId, decided }: { findingId: string; decided: boolean }) {
  const t = useTranslations("prReview");
  const create = useCreateEvalCaseFromFinding();
  // Same-tick double clicks must not fire two requests (`isPending` lags a render).
  const inFlight = React.useRef(false);
  // Targets are fetched lazily: only a decided, expanded card (this component only mounts expanded).
  const targets = useEvalTargets(decided ? findingId : null);
  const skills = targets.data?.skills ?? [];
  // "" = the review's agent (default); otherwise a linked skill id.
  const [target, setTarget] = React.useState("");
  const skillTarget = skills.find((sk) => sk.id === target);
  const hintId = `eval-case-hint-${findingId}`;

  const onClick = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const opts = {
      onSettled: () => {
        inFlight.current = false;
      },
    };
    if (skillTarget) {
      create.mutate({ findingId, target: { owner_kind: "skill", owner_id: skillTarget.id } }, opts);
    } else {
      create.mutate(findingId, opts);
    }
  };

  const reason = create.isError ? evalCaseUnavailableReason(create.error) : undefined;
  const result = create.data;

  const caseHref =
    result &&
    (result.case.owner_kind === "skill"
      ? `/skills/${result.case.owner_id}?tab=evals&case=${result.case.id}`
      : `/agents/${result.case.owner_id}?tab=evals&case=${result.case.id}`);

  return (
    <>
      {decided && skills.length > 0 && (
        <select
          aria-label={t("finding.evalCase.targetLabel")}
          value={target}
          disabled={create.isPending}
          onChange={(e) => setTarget(e.target.value)}
          style={s.evalTarget}
        >
          <option value="">{targets.data?.agent?.name ?? t("finding.evalCase.targetAgent")}</option>
          {skills.map((sk) => (
            <option key={sk.id} value={sk.id}>
              {t("finding.evalCase.targetSkill", { name: sk.name })}
            </option>
          ))}
        </select>
      )}
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided}
        loading={create.isPending}
        aria-describedby={decided ? undefined : hintId}
        onClick={onClick}
      >
        {t("finding.turnIntoEvalCase")}
      </Button>
      {!decided && (
        <span id={hintId} style={s.evalHint}>
          {t("finding.evalCase.undecided")}
        </span>
      )}
      {result && (
        <span role="status" style={s.evalHint}>
          {t(result.created ? "finding.evalCase.added" : "finding.evalCase.existing", {
            owner: result.owner_name,
          })}{" "}
          <Link href={caseHref ?? "#"} style={s.evalLink}>
            {t("finding.evalCase.viewCase")}
          </Link>
        </span>
      )}
      {create.isError && (
        <span role="alert" style={s.evalError}>
          {reason ? t(`finding.evalCase.reason.${reason}`) : t("finding.evalCase.failed")}
        </span>
      )}
    </>
  );
}
