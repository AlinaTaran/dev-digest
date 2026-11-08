/* Start / progress button for an eval run. Presentational: the container owns the mutation and
   passes progress + the last start outcome as `notice`. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export type RunEvalNotice = "llm_not_configured" | "in_progress" | "no_cases" | "too_many_cases" | null;

export interface RunEvalButtonProps {
  onStart: () => void;
  /** Non-null while a run is active: shows "Running… done/total" and disables the button. */
  progress?: { done: number; total: number } | null;
  disabled?: boolean;
  notice?: RunEvalNotice;
  /** Idle label; defaults to "Run all evals". */
  label?: string;
}

export const API_KEYS_HREF = "/settings/api-keys";

export function RunEvalButton({ onStart, progress = null, disabled, notice = null, label }: RunEvalButtonProps) {
  const t = useTranslations("eval");
  const running = progress != null;
  return (
    <div style={s.wrap}>
      <Button
        kind="primary"
        icon="Play"
        loading={running}
        disabled={disabled}
        onClick={onStart}
      >
        {running ? t("evalsTab.runAllRunning", { done: progress.done, total: progress.total }) : (label ?? t("evalsTab.runAll"))}
      </Button>
      {notice === "llm_not_configured" && (
        <div role="alert" style={s.warn}>
          {t("evalsTab.llmNotConfigured")}
          <Link href={API_KEYS_HREF} style={s.link}>
            {t("evalsTab.llmNotConfiguredLink")}
          </Link>
        </div>
      )}
      {notice === "in_progress" && (
        <div role="status" style={s.notice}>
          {t("evalsTab.runInProgress")}
        </div>
      )}
      {notice === "no_cases" && (
        <div role="alert" style={s.warn}>
          {t("evalsTab.runNoCases")}
        </div>
      )}
      {notice === "too_many_cases" && (
        <div role="alert" style={s.warn}>
          {t("evalsTab.runTooManyCases")}
        </div>
      )}
    </div>
  );
}
