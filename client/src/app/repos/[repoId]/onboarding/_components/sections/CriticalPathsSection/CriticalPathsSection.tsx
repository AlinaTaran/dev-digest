import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingCriticalPathsSection } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function CriticalPathsSection({
  section,
  repoFullName,
  sourceSha,
}: {
  section: OnboardingCriticalPathsSection;
  repoFullName: string;
  sourceSha: string;
}) {
  const t = useTranslations("onboarding");

  return (
    <ul style={s.list}>
      {section.items.map((item) => (
        <li key={item.path} style={s.row}>
          <span aria-hidden="true" style={s.icon}>
            <Icon.File size={14} />
          </span>
          <span style={s.main}>
            <span className="mono" title={item.path} style={s.path}>
              {item.path}
            </span>
            {item.why && <span style={s.why}>— {item.why}</span>}
            <span style={s.fanIn}>{t("critical.importedBy", { count: item.fan_in })}</span>
          </span>
          <a
            href={githubBlobUrl(repoFullName, sourceSha, item.path)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("critical.openLabel", { path: item.path })}
            style={s.open}
          >
            {t("critical.open")}
          </a>
        </li>
      ))}
    </ul>
  );
}
