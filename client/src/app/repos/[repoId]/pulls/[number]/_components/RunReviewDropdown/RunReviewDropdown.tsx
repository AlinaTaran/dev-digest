/* RunReviewDropdown — "Pick agents to run" checklist popover.
   1 agent → POST /pulls/:id/review {agentId} (hands runIds up for live SSE status);
   2+ agents → POST /pulls/:id/multi-agent-run, then open the results page. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { useAgentEstimates, useStartMultiAgentRun } from "../../../../../../../lib/hooks/multi-agent";
import {
  estimateTotal,
  formatCardEstimate,
  formatTotalCost,
  formatTotalDuration,
} from "../../../../../../../lib/multi-agent-estimates";
import { DROPDOWN_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a single-agent run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the single-agent run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const params = useParams<{ repoId: string; number: string }>();
  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const runOne = useRunReview();
  const runMany = useStartMultiAgentRun();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [failed, setFailed] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inFlight = React.useRef(false);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const all = agents ?? [];
  const estimateById = new Map((estimates ?? []).map((e) => [e.agent_id, e]));
  const pending = runOne.isPending || runMany.isPending;
  const count = selected.length;
  const total = estimateTotal(selected, estimates);
  const multiHref = `/repos/${params.repoId}/multi-agent`;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const launch = async () => {
    if (count === 0 || inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    try {
      if (count === 1) {
        onRunStart?.();
        try {
          const res = await runOne.mutateAsync({ prId, agentId: selected[0] });
          onRunsStarted?.(res.runs.map((r) => r.run_id));
          setOpen(false);
        } finally {
          onRunSettled?.();
        }
      } else {
        await runMany.mutateAsync({ prId, agentIds: selected });
        setOpen(false);
        router.push(`${multiHref}/${params.number}`);
      }
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        onClick={() => setOpen((o) => !o)}
        title={warnMerged ? t("picker.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={pending}>
          {pending ? t("picker.running") : t("picker.trigger")}
        </Button>
      </span>
      {open && (
        <div style={{ ...s.popover, width: DROPDOWN_WIDTH }}>
          {warnMerged && (
            <div style={s.warning}>
              <Icon.AlertTriangle size={14} />
              <span>{t("picker.mergedWarning")}</span>
            </div>
          )}
          <div style={s.header}>
            <span style={s.title}>{t("picker.title")}</span>
            <Button kind="tertiary" size="sm" onClick={() => setSelected([])}>
              {t("picker.clear")}
            </Button>
          </div>
          {all.length === 0 ? (
            <button type="button" style={s.link} onClick={() => router.push("/agents")}>
              {t("picker.noAgents")}
            </button>
          ) : (
            all.map((a) => (
              <label key={a.id} style={s.row}>
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  aria-label={a.name}
                />
                <span style={s.rowName}>{a.name}</span>
                {!a.enabled && <span style={s.rowHint}>{t("picker.disabledMark")}</span>}
                <span style={s.rowHint}>{formatCardEstimate(estimateById.get(a.id))}</span>
              </label>
            ))
          )}
          <div style={s.divider} />
          {count >= 2 && (
            <div style={s.total}>
              {t("estimate.total", {
                duration: formatTotalDuration(total.maxMs),
                cost: formatTotalCost(total.sumUsd),
              })}
            </div>
          )}
          {failed && <div style={s.error}>{t("picker.error")}</div>}
          <Button kind="primary" size="sm" disabled={count === 0 || pending} onClick={launch}>
            {count >= 2 ? t("picker.runMany", { count }) : t("picker.runOne")}
          </Button>
          <button
            type="button"
            style={s.link}
            onClick={() => {
              setOpen(false);
              router.push(`${multiHref}/new?pr=${params.number}`);
            }}
          >
            {t("picker.configure")}
          </button>
        </div>
      )}
    </div>
  );
}
