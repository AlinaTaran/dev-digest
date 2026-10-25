import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingReadingPathSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { PathLink } from "../PathLink/PathLink";
import { s } from "./styles";

export function ReadingPathSection({
  section,
  repoFullName,
  sourceSha,
}: {
  section: OnboardingReadingPathSection;
  repoFullName: string;
  sourceSha: string;
}) {
  const t = useTranslations("onboarding");

  return (
    <ol style={s.list}>
      {section.steps.map((step) => (
        <li key={step.path} style={s.row}>
          <div style={s.item}>
            <PathLink
              href={githubBlobUrl(repoFullName, sourceSha, step.path)}
              path={step.path}
              label={t("reading.openLabel", { path: step.path })}
            />
            <span style={s.why}>{step.why}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
