/* Evals tab of the Agent Editor: metric tiles (+ sparklines), trend chart, case list (new / edit /
   run / delete / run-all with polling progress), run history, compare modal (+ Promote) and
   per-run details. `?case=<id>` opens that case in the editor. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent, CreateEvalCaseBody, EvalCaseView, EvalSuiteRun } from "@devdigest/shared";
import { EvalCaseList } from "@/components/eval/EvalCaseList/EvalCaseList";
import { EvalMetricTiles } from "@/components/eval/EvalMetricTiles/EvalMetricTiles";
import { EvalCaseEditorModal } from "@/components/eval/EvalCaseEditorModal/EvalCaseEditorModal";
import { EvalTrendChart } from "@/components/eval/EvalTrendChart/EvalTrendChart";
import { PromoteButton } from "@/components/eval/PromoteButton/PromoteButton";
import { EvalRunHistory } from "@/components/eval/EvalRunHistory/EvalRunHistory";
import { CompareRunsModal } from "@/components/eval/CompareRunsModal/CompareRunsModal";
import type { RunEvalNotice } from "@/components/eval/RunEvalButton/RunEvalButton";
import {
  evalRunUnavailableReason,
  useAgentEvalCases,
  useAgentEvalDashboard,
  useCreateAgentEvalCase,
  useAgentEvalRuns,
  useDeleteEvalCase,
  useEvalRun,
  useRunEvalCase,
  useStartAgentEvalRun,
  useUpdateEvalCase,
} from "@/lib/hooks/eval";
import { EvalRunDetailsLoader } from "./EvalRunDetailsLoader";
import { finishedRuns, noticeForReason } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const search = useSearchParams();
  const highlightCaseId = search.get("case");

  const cases = useAgentEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id);
  const start = useStartAgentEvalRun();
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const createCase = useCreateAgentEvalCase();
  const updateCase = useUpdateEvalCase();
  const dashboard = useAgentEvalDashboard(agent.id);

  const [attachedRunId, setAttachedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<RunEvalNotice>(null);
  const [editor, setEditor] = useState<{ kind: "new" } | { kind: "edit"; id: string } | null>(null);
  const [caseParamDismissed, setCaseParamDismissed] = useState(false);
  const [pair, setPair] = useState<[EvalSuiteRun, EvalSuiteRun] | null>(null);

  const runList = runs.data ?? [];
  // Attach to an already-running suite (page reload / another tab) as well as our own.
  const activeRunId = attachedRunId ?? runList.find((r) => r.status === "running")?.id ?? null;
  const active = useEvalRun(activeRunId);
  const activeRun = active.data?.eval_run;
  const caseList = cases.data ?? [];

  const progress =
    activeRunId && (!activeRun || activeRun.status === "running")
      ? { done: activeRun?.cases_done ?? 0, total: activeRun?.cases_total ?? caseList.length }
      : start.isPending
        ? { done: 0, total: caseList.length }
        : null;

  const onStart = () => {
    setNotice(null);
    start.mutate(agent.id, {
      onSuccess: (outcome) => {
        if (outcome.kind === "in_progress") setNotice("in_progress");
        setAttachedRunId(outcome.kind === "started" ? outcome.run.id : outcome.activeRunId);
      },
      onError: (e) => setNotice(noticeForReason(evalRunUnavailableReason(e))),
    });
  };

  // Explicit New/Edit wins; otherwise `?case=<id>` (AC-10 deep link) opens that case once it has loaded.
  const deepLinked = !caseParamDismissed && highlightCaseId ? caseList.find((c) => c.id === highlightCaseId) : undefined;
  const editing: EvalCaseView | undefined =
    editor?.kind === "edit" ? caseList.find((c) => c.id === editor.id) : editor ? undefined : deepLinked;
  const editorOpen = editor?.kind === "new" || !!editing;
  const closeEditor = () => {
    setEditor(null);
    setCaseParamDismissed(true);
  };
  const saveCase = (draft: CreateEvalCaseBody, existingId: string | null) =>
    existingId ? updateCase.mutateAsync({ id: existingId, ...draft }) : createCase.mutateAsync({ agentId: agent.id, ...draft });

  const trend = dashboard.data?.trend ?? [];
  const sparklines = {
    recall: trend.map((p) => p.recall),
    precision: trend.map((p) => p.precision),
    citation_accuracy: trend.map((p) => p.citation_accuracy),
  };

  const finished = finishedRuns(runList);
  const runningCaseIds = new Set(runCase.isPending && runCase.variables ? [runCase.variables.id] : []);

  return (
    <div style={s.wrap}>
      <section aria-label={t("evalsTab.metricsTitle")}>
        <div style={s.metricsHeader}>
          <h3 style={s.h3}>{t("evalsTab.metricsTitle")}</h3>
          <p style={s.hint}>{t("evalsTab.metricsSubtitle")}</p>
        </div>
        <EvalMetricTiles latest={finished[0] ?? null} previous={finished[1] ?? null} sparklines={sparklines} />
        <p style={s.scoring}>
          <Icon.Code size={13} aria-hidden="true" />
          {t("evalsTab.scoringNote")}
        </p>
      </section>

      <section aria-label={t("trend.title")}>
        <div style={s.trendHeader}>
          <h3 style={s.h3}>{t("trend.title")}</h3>
          <Link href={`/eval/${agent.id}`} style={s.link}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <EvalTrendChart points={trend} />
      </section>

      {activeRun?.status === "failed" && (
        <div role="alert" style={s.error}>
          {t("evalsTab.runFailedTitle")}
          {activeRun.error_reason ? ` — ${activeRun.error_reason}` : ""}
        </div>
      )}

      <EvalCaseList
        cases={caseList}
        loading={cases.isLoading}
        runAll={{ onStart, progress, notice, disabled: start.isPending }}
        runningCaseIds={runningCaseIds}
        highlightCaseId={highlightCaseId}
        onNew={() => setEditor({ kind: "new" })}
        onEdit={(c) => setEditor({ kind: "edit", id: c.id })}
        onRunCase={(c) => runCase.mutate({ id: c.id })}
        onDelete={(c) => deleteCase.mutate(c.id)}
      />

      <EvalRunHistory
        runs={runList}
        onCompare={(a, b) => setPair([a, b])}
        renderDetails={(run) => <EvalRunDetailsLoader runId={run.id} cases={caseList} />}
      />

      {pair && (
        <CompareRunsModal
          a={pair[0]}
          b={pair[1]}
          onClose={() => setPair(null)}
          footerExtra={<PromoteButton agent={agent} a={pair[0]} b={pair[1]} />}
        />
      )}

      {editorOpen && (
        <EvalCaseEditorModal
          key={editing?.id ?? "new"}
          initialCase={editing}
          subtitle={t("caseEditor.subtitle", { name: agent.name })}
          onSave={saveCase}
          onRun={(id) => runCase.mutateAsync({ id })}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
