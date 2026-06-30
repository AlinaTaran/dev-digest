/* FindingsPopover — hover preview of a review's findings, shared by the PR
   list (FINDINGS column) and the PR-detail timeline. Each row mirrors the
   collapsed FindingCard: severity icon, title, category, file:line, confidence,
   and a 2-line rationale excerpt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  HoverCard,
  SEV,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

// Critical → Warning → Suggestion, matching the FindingsPanel sort.
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

function lineLabel(f: Pick<Finding, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

function FindingRow({
  f,
  first,
  repoFullName,
  headSha,
}: {
  f: Finding;
  first: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const sev = SEV[f.severity as Severity] ?? SEV.INFO;
  const SevIcon = Icon[sev.icon];
  const href =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: first ? "none" : "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <SevIcon size={15} style={{ color: sev.c, flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35 }}>
          {f.title}
        </span>
        <CategoryTag category={f.category as Category} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
        <MonoLink href={href}>
          {f.file}:{lineLabel(f)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--text-secondary)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {f.rationale}
      </div>
    </div>
  );
}

export function FindingsPopover({
  findings,
  repoFullName,
  headSha,
  children,
  block,
  anchorRef,
}: {
  findings: Finding[];
  repoFullName?: string | null;
  headSha?: string | null;
  children: React.ReactNode;
  /** Make the whole wrapped element the hover area (e.g. a timeline row). */
  block?: boolean;
  /** Position the card under this element instead of the whole trigger. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("prReview");
  // No findings → plain trigger, no hover affordance.
  if (!findings || findings.length === 0) return <>{children}</>;

  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  return (
    <HoverCard trigger={children} width={360} block={block} anchorRef={anchorRef}>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 360 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "12px 16px",
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <Icon.Info size={14} />
          {t("findingsPopover.header", { count: findings.length })}
        </div>
        <div style={{ overflowY: "auto" }}>
          {sorted.map((f, i) => (
            <FindingRow
              key={f.id}
              f={f}
              first={i === 0}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </div>
      </div>
    </HoverCard>
  );
}
