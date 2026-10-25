import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection, OnboardingSectionEmptyReason } from "@devdigest/shared";
import { ArchitectureSection } from "../ArchitectureSection/ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection/CriticalPathsSection";
import { RunLocallySection } from "../RunLocallySection/RunLocallySection";
import { ReadingPathSection } from "../ReadingPathSection/ReadingPathSection";
import { FirstTasksSection } from "../FirstTasksSection/FirstTasksSection";
import { s } from "./styles";

const EMPTY_KEY: Record<OnboardingSectionEmptyReason, string> = {
  all_dropped: "nothingVerifiable",
  needs_llm: "needsLlm",
  no_data: "noData",
};

function isEmpty(section: OnboardingSection): boolean {
  switch (section.kind) {
    case "architecture":
      return !section.summary_md && section.top_dirs.length === 0 && section.diagram === null;
    case "critical_paths":
      return section.items.length === 0;
    case "run_locally":
    case "reading_path":
      return section.steps.length === 0;
    case "first_tasks":
      return section.tasks.length === 0;
  }
}

export interface SectionBodyProps {
  section: OnboardingSection;
  repoFullName: string;
  sourceSha: string;
}

/** Renders one tour section's body, or the empty-reason message when it has nothing to show. */
export function SectionBody({ section, repoFullName, sourceSha }: SectionBodyProps) {
  const t = useTranslations("onboarding");

  if (isEmpty(section)) {
    return <p style={s.empty}>{t(`section.${EMPTY_KEY[section.empty_reason ?? "no_data"]}`)}</p>;
  }

  const common = { repoFullName, sourceSha };
  switch (section.kind) {
    case "architecture":
      return <ArchitectureSection section={section} {...common} />;
    case "critical_paths":
      return <CriticalPathsSection section={section} {...common} />;
    case "run_locally":
      return <RunLocallySection section={section} />;
    case "reading_path":
      return <ReadingPathSection section={section} {...common} />;
    case "first_tasks":
      return <FirstTasksSection section={section} {...common} />;
  }
}
