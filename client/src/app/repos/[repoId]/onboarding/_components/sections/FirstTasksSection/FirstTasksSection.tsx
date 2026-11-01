import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingFirstTasksSection } from "@devdigest/shared";
import { Badge } from "@devdigest/ui";
import { githubBlobUrl, githubTreeUrl } from "@/lib/github-urls";
import { PathLink } from "../PathLink/PathLink";
import { s } from "./styles";

type Task = OnboardingFirstTasksSection["tasks"][number];

function taskUrl(task: Task, repoFullName: string, sourceSha: string): string {
  switch (task.path_kind) {
    case "file":
      return githubBlobUrl(repoFullName, sourceSha, task.path);
    case "dir":
      return githubTreeUrl(repoFullName, sourceSha, task.path);
    case "new_file": {
      const i = task.path.lastIndexOf("/");
      return githubTreeUrl(repoFullName, sourceSha, i < 0 ? "" : task.path.slice(0, i));
    }
  }
}

export function FirstTasksSection({
  section,
  repoFullName,
  sourceSha,
}: {
  section: OnboardingFirstTasksSection;
  repoFullName: string;
  sourceSha: string;
}) {
  const t = useTranslations("onboarding");

  // Container query: 3 columns from 720px of content width, else 1 (also with 1–2 cards).
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-3 @[720px]:grid-cols-3" style={s.grid}>
        {section.tasks.map((task) => (
          <li key={`${task.path_kind}:${task.path}`} style={s.card}>
            <span style={s.title}>{task.title}</span>
            <PathLink
              href={taskUrl(task, repoFullName, sourceSha)}
              path={task.path}
              label={t("tasks.openLabel", { path: task.path })}
            />
            <div style={s.footer}>
              <Badge color={task.complexity === "low" ? "var(--ok)" : "var(--warn)"} bg={task.complexity === "low" ? "var(--ok-bg)" : "var(--warn-bg)"}>
                {t(`tasks.complexity.${task.complexity}`)}
              </Badge>
              {task.path_kind === "new_file" && <span style={s.newFile}>{t("tasks.newFile")}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
