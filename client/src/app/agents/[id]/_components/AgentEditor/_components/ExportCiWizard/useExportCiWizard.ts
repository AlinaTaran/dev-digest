/* useExportCiWizard — all wizard state + server calls, so the step components stay presentational. */
"use client";

import React from "react";
import type { Agent, CiPostAs, CiTriggerEvent } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { useCiPreview, useExportCi, useExportCiZip } from "@/lib/hooks/ci";
import { CI_PROVIDER, DEFAULT_POST_AS, DEFAULT_TRIGGERS, LAST_STEP, TRIGGERS } from "./constants";

type InstallMode = "open_pr" | "zip";
export type WizardResult = { kind: "pr"; prUrl: string | null } | { kind: "zip" };

interface State {
  step: number;
  repo: string | null;
  triggers: CiTriggerEvent[];
  postAs: CiPostAs;
  selectedPath: string | null;
  /** Hand-edited workflow text; null = use the generated one. */
  edited: string | null;
  mode: InstallMode;
  result: WizardResult | null;
}

type Action =
  | { type: "go"; step: number }
  | { type: "repo"; repo: string }
  | { type: "config"; triggers: CiTriggerEvent[]; postAs: CiPostAs }
  | { type: "select"; path: string }
  | { type: "edit"; text: string }
  | { type: "mode"; mode: InstallMode }
  | { type: "done"; result: WizardResult };

const initial: State = {
  step: 0,
  repo: null,
  triggers: [...DEFAULT_TRIGGERS],
  postAs: DEFAULT_POST_AS,
  selectedPath: null,
  edited: null,
  mode: "open_pr",
  result: null,
};

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "go":
      return { ...state, step: a.step };
    case "repo":
      return { ...state, repo: a.repo, edited: null, selectedPath: null };
    case "config":
      // A regenerated preview replaces any manual workflow edit (AC-37).
      return { ...state, triggers: a.triggers, postAs: a.postAs, edited: null };
    case "select":
      return { ...state, selectedPath: a.path };
    case "edit":
      return { ...state, edited: a.text };
    case "mode":
      return { ...state, mode: a.mode };
    case "done":
      return { ...state, result: a.result };
  }
}

export function useExportCiWizard(agent: Agent) {
  const { data: repos = [] } = useRepos();
  const { activeRepo } = useActiveRepo();
  const [state, dispatch] = React.useReducer(reducer, initial);
  const preview = useCiPreview(agent.id);
  const exportPr = useExportCi(agent.id);
  const exportZip = useExportCiZip(agent.id);
  const installing = React.useRef(false);

  const repo = state.repo ?? activeRepo?.full_name ?? repos[0]?.full_name ?? "";
  const supported = agent.provider === CI_PROVIDER;
  const files = preview.data?.files ?? [];
  const selectedFile = files.find((f) => f.path === state.selectedPath) ?? files[0] ?? null;

  const runPreview = (next: { repo: string; triggers: CiTriggerEvent[]; postAs: CiPostAs }) =>
    preview.mutate({ repo: next.repo, triggers: next.triggers, post_as: next.postAs });

  const canContinue =
    state.step === 0 ? supported && repo !== "" : !preview.isPending && preview.data != null;

  const next = () => {
    if (state.step === 0) runPreview({ repo, triggers: state.triggers, postAs: state.postAs });
    dispatch({ type: "go", step: Math.min(state.step + 1, LAST_STEP) });
  };
  const back = () => dispatch({ type: "go", step: Math.max(state.step - 1, 0) });

  const setRepo = (value: string) => dispatch({ type: "repo", repo: value });

  const setConfig = (triggers: CiTriggerEvent[], postAs: CiPostAs) => {
    dispatch({ type: "config", triggers, postAs });
    runPreview({ repo, triggers, postAs });
  };
  const toggleTrigger = (t: CiTriggerEvent) => {
    const has = state.triggers.includes(t);
    // The server requires at least one trigger.
    if (has && state.triggers.length === 1) return;
    const triggers = TRIGGERS.filter((x) => (x === t ? !has : state.triggers.includes(x)));
    setConfig(triggers, state.postAs);
  };
  const setPostAs = (postAs: CiPostAs) => setConfig(state.triggers, postAs);

  const install = () => {
    if (installing.current) return;
    installing.current = true;
    const body = {
      repo,
      target: "gha" as const,
      post_as: state.postAs,
      triggers: state.triggers,
      ...(state.edited !== null ? { workflow_override: state.edited } : {}),
    };
    const settle = () => {
      installing.current = false;
    };
    if (state.mode === "zip") {
      exportZip.mutate(
        { ...body, action: "zip" },
        { onSuccess: () => dispatch({ type: "done", result: { kind: "zip" } }), onSettled: settle },
      );
    } else {
      exportPr.mutate(
        { ...body, action: "open_pr" },
        {
          onSuccess: (r) => dispatch({ type: "done", result: { kind: "pr", prUrl: r.pr_url } }),
          onSettled: settle,
        },
      );
    }
  };

  const installError = state.mode === "zip" ? exportZip.error : exportPr.error;

  return {
    state,
    repo,
    repos,
    supported,
    preview,
    files,
    selectedFile,
    canContinue,
    installing: exportPr.isPending || exportZip.isPending,
    installError,
    next,
    back,
    install,
    setRepo,
    toggleTrigger,
    setPostAs,
    selectFile: (path: string) => dispatch({ type: "select", path }),
    editWorkflow: (text: string) => dispatch({ type: "edit", text }),
    setMode: (mode: InstallMode) => dispatch({ type: "mode", mode }),
  };
}

export type Wizard = ReturnType<typeof useExportCiWizard>;
