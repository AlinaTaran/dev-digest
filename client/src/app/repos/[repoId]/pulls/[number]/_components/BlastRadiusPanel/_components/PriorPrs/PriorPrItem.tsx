"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@devdigest/ui";
import { githubPrUrl } from "@/lib/github-urls";
import type { PrHistoryItem } from "@/lib/types";
import { mergedDate } from "./helpers";
import { s } from "./styles";

export function PriorPrItem({ item, repoFullName }: { item: PrHistoryItem; repoFullName: string | null }) {
  const t = useTranslations("blast");
  const label = `#${item.pr_number}`;
  const notes = item.notes || t("history.touched", { files: item.files_overlap.join(", ") });

  return (
    <li style={s.item}>
      <div style={s.titleRow}>
        <span aria-hidden style={s.bullet}>•</span>
        {repoFullName ? (
          <a
            href={githubPrUrl(repoFullName, item.pr_number)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("history.openPr", { number: item.pr_number })}
            style={s.link}
          >
            {label}
          </a>
        ) : (
          <span style={s.link}>{label}</span>
        )}
        <span style={s.title}>{item.title}</span>
      </div>
      <div style={s.meta}>
        <Avatar name={item.author || "?"} size={18} />
        <span>
          {item.author} · {t("history.merged", { date: mergedDate(item.merged_at) })}
        </span>
      </div>
      <p style={s.notes}>{notes}</p>
    </li>
  );
}
