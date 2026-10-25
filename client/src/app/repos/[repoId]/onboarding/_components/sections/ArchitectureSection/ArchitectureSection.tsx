import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingArchitectureSection } from "@devdigest/shared";
import { Markdown } from "@devdigest/ui";
import { ArchitectureDiagram } from "./ArchitectureDiagram/ArchitectureDiagram";
import { s } from "./styles";

export function ArchitectureSection({
  section,
  repoFullName,
  sourceSha,
}: {
  section: OnboardingArchitectureSection;
  repoFullName: string;
  sourceSha: string;
}) {
  const t = useTranslations("onboarding");

  return (
    <div style={s.root}>
      {section.summary_md && (
        <div style={s.summary}>
          <Markdown>{section.summary_md}</Markdown>
        </div>
      )}
      {section.top_dirs.length > 0 && (
        <div>
          <h4 style={s.subhead}>{t("architecture.topDirs")}</h4>
          <ul style={s.dirs}>
            {section.top_dirs.map((d) => (
              <li key={d.path} style={s.dirRow}>
                <code className="mono" style={s.dirPath}>
                  {d.path}
                </code>
                <span style={s.dirCount}>{t("architecture.dirFiles", { count: d.files })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {section.diagram && (
        <ArchitectureDiagram diagram={section.diagram} repoFullName={repoFullName} sourceSha={sourceSha} />
      )}
    </div>
  );
}
