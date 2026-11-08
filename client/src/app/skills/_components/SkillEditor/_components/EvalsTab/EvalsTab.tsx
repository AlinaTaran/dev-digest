/* Evals tab of the Skill Editor: host agent picker, metric tiles, trend, case list (new / edit /
   run / delete / run-all with polling progress), run history with host column, skill-mode compare
   (+ Promote skill body) and per-run details. Skill runs never appear on /eval (AC-86). */
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CreateEvalCaseBody, EvalSuiteRun, EvalTrendPoint, Skill } from "@devdigest/shared";
import { EvalCaseList } from "@/components/eval/EvalCaseList/EvalCaseList";
import { EvalMetricTiles } from "@/components/eval/EvalMetricTiles/EvalMetricTiles";
import { EvalCaseEditorModal } from "@/components/eval/EvalCaseEditorModal/EvalCaseEditorModal";
import { EvalTrendChart } from "@/components/eval/EvalTrendChart/EvalTrendChart";
import { EvalRunHistory } from "@/components/eval/EvalRunHistory/EvalRunHistory";
import { CompareRunsModal } from "@/components/eval/CompareRunsModal/CompareRunsModal";
import { HostAgentPicker } from "@/components/eval/HostAgentPicker/HostAgentPicker";
import { SkillPromoteButton } from "@/components/eval/SkillPromoteButton/SkillPromoteButton";
import {
  useCreateSkillEvalCase,
  useDeleteEvalCase,
  useRunEvalCase,
  useSkillEvalCases,
  useUpdateEvalCase,
} from "@/lib/hooks/eval";
import { SkillTrendTooltip } from "./SkillTrendTooltip";
import { EvalRunDetailsLoader } from "./EvalRunDetailsLoader";
import { finishedRuns, trendPoints } from "./helpers";
import type { SkillEvalRunner } from "./useSkillEvalRunner";
import { s } from "./styles";

export function EvalsTab({ skill, runner }: { skill: Skill; runner: SkillEvalRunner }) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const deepLinkedCaseId = useSearchParams()?.get("case") ?? null;

  const cases = useSkillEvalCases(skill.id);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const createCase = useCreateSkillEvalCase();
  const updateCase = useUpdateEvalCase();

  const [editor, setEditor] = useState<{ kind: "new" } | { kind: "edit"; id: string } | null>(null);
  const [caseParamDismissed, setCaseParamDismissed] = useState(false);
  const [pair, setPair] = useState<[EvalSuiteRun, EvalSuiteRun] | null>(null);

  const caseList = cases.data ?? [];
  // Explicit New/Edit wins; otherwise `?case=<id>` (deep link from FindingCard) opens that case once loaded.
  const deepLinked = !caseParamDismissed && deepLinkedCaseId ? caseList.find((c) => c.id === deepLinkedCaseId) : undefined;
  const editing = editor?.kind === "edit" ? caseList.find((c) => c.id === editor.id) : editor ? undefined : deepLinked;
  const editorOpen = editor?.kind === "new" || !!editing;
  const closeEditor = () => {
    setEditor(null);
    setCaseParamDismissed(true);
  };

  const saveCase = (draft: CreateEvalCaseBody, existingId: string | null) =>
    existingId
      ? updateCase.mutateAsync({ id: existingId, ...draft })
      : createCase.mutateAsync({ skillId: skill.id, ...draft });

  const finished = finishedRuns(runner.runs);
  const trend = trendPoints(finished);
  const hostOf = new Map(runner.runs.map((r) => [r.id, r.host_agent_name]));
  const sparklines = {
    recall: trend.map((p) => p.recall),
    precision: trend.map((p) => p.precision),
    citation_accuracy: trend.map((p) => p.citation_accuracy),
  };
  const runningCaseIds = new Set(runCase.isPending && runCase.variables ? [runCase.variables.id] : []);

  const onRunCase = (id: string) => {
    if (!runner.hostId) {
      runner.setNotice("no_host_agent");
      return;
    }
    runCase.mutate({ id, hostAgentId: runner.hostId });
  };

  const baseNotice = runner.notice === "no_host_agent" ? null : runner.notice;

  return (
    <div style={s.wrap}>
      <div style={s.hostRow}>
        <HostAgentPicker agents={runner.enabledAgents} value={runner.hostId} onChange={runner.setHostId} />
      </div>
      {runner.notice === "no_host_agent" && (
        <div role="alert" style={s.warn}>
          {t("evals.noHostAgent")}
        </div>
      )}

      <section aria-label={te("evalsTab.metricsTitle")}>
        <div style={s.metricsHeader}>
          <h3 style={s.h3}>{te("evalsTab.metricsTitle")}</h3>
          <p style={s.hint}>{t("evals.metricsSubtitle")}</p>
        </div>
        <EvalMetricTiles latest={finished[0] ?? null} previous={finished[1] ?? null} sparklines={sparklines} />
      </section>

      <section aria-label={te("trend.title")}>
        <h3 style={{ ...s.h3, marginBottom: 10 }}>{te("trend.title")}</h3>
        <EvalTrendChart
          points={trend}
          renderTooltip={(p: EvalTrendPoint) => <SkillTrendTooltip point={p} hostName={hostOf.get(p.run_id)} />}
        />
      </section>

      {runner.failedReason !== undefined && (
        <div role="alert" style={s.error}>
          {te("evalsTab.runFailedTitle")}
          {runner.failedReason ? ` — ${runner.failedReason}` : ""}
        </div>
      )}

      <EvalCaseList
        cases={caseList}
        loading={cases.isLoading}
        runAll={{
          onStart: runner.start,
          progress: runner.progress,
          notice: baseNotice,
          disabled: runner.starting || runner.hostId === null,
        }}
        runningCaseIds={runningCaseIds}
        onNew={() => setEditor({ kind: "new" })}
        onEdit={(c) => setEditor({ kind: "edit", id: c.id })}
        onRunCase={(c) => onRunCase(c.id)}
        onDelete={(c) => deleteCase.mutate(c.id)}
      />

      <EvalRunHistory
        runs={runner.runs}
        onCompare={(a, b) => setPair([a, b])}
        renderDetails={(run) => <EvalRunDetailsLoader runId={run.id} cases={caseList} />}
      />

      {pair && (
        <CompareRunsModal
          mode="skill"
          a={pair[0]}
          b={pair[1]}
          onClose={() => setPair(null)}
          footerExtra={<SkillPromoteButton skill={skill} a={pair[0]} b={pair[1]} />}
        />
      )}

      {editorOpen && (
        <EvalCaseEditorModal
          key={editing?.id ?? "new"}
          initialCase={editing}
          subtitle={t("evals.editorSubtitle", { name: skill.name })}
          onSave={saveCase}
          onRun={(id) => runCase.mutateAsync({ id, hostAgentId: runner.hostId ?? undefined })}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
