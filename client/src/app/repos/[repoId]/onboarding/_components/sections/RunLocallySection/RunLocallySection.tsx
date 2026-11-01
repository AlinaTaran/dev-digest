"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingRunLocallySection } from "@devdigest/shared";
import { IconBtn } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

const COPIED_MS = 2000;

export function RunLocallySection({ section }: { section: OnboardingRunLocallySection }) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (command: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      toast.error(t("run.copyFailed"));
      return;
    }
    setCopiedIdx(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedIdx(null), COPIED_MS);
  };

  return (
    <div style={s.root}>
      <p style={s.caption}>{t("run.caption")}</p>
      <ol style={s.list}>
        {section.steps.map((step, i) => (
          <li key={`${i}-${step.command}`} style={s.row}>
            <div style={s.item}>
            <div style={s.main}>
              <code className="mono" style={s.command}>
                {step.command}
              </code>
              <span style={s.meta}>
                {t("run.source", { path: step.source_path })}
                {step.note ? ` · ${step.note}` : ""}
              </span>
            </div>
            {copiedIdx === i && (
              <span role="status" style={s.copied}>
                {t("run.copied")}
              </span>
            )}
            <IconBtn icon="Copy" label={t("run.copy", { command: step.command })} onClick={() => void copy(step.command, i)} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
