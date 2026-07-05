/* PreviewTab — renders the skill body as Markdown, i.e. "as the reviewing
   agent receives it". Imported (non-manual) skills show the same untrusted
   notice the run-time prompt wraps them in. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const untrusted = skill.source !== "manual";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("preview.heading")}</h2>
        {untrusted && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
      </div>
      <p style={s.subheading}>{t("preview.subheading")}</p>
      {untrusted && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>}
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
