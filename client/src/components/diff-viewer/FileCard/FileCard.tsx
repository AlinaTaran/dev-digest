/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, Finding, Severity } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, lineKey, anchorId, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine/CodeLine";
import { OutdatedComments } from "../OutdatedComments/OutdatedComments";

/** Highest-severity-wins map of new-line-number → {severity, findingId}, for the
 *  code-line overlay. The findingId is the *winning* finding's id, so the chip
 *  links to exactly the finding it visually represents. Findings without a
 *  resolvable line number (end < start) are skipped. */
function severityByLine(
  findings: Finding[] | undefined
): Map<number, { severity: Severity; findingId: string }> {
  const map = new Map<number, { severity: Severity; findingId: string }>();
  if (!findings) return map;
  const rank: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
  for (const f of findings) {
    for (let line = f.start_line; line <= f.end_line; line++) {
      const existing = map.get(line);
      if (!existing || rank[f.severity] > rank[existing.severity])
        map.set(line, { severity: f.severity, findingId: f.id });
    }
  }
  return map;
}

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  defaultOpen,
  findings,
  mechanical,
  findingsLabel,
  mechanicalPlaceholderText,
  onFindingClick,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Smart Diff: overrides the size-based initial `open` state. */
  defaultOpen?: boolean;
  /** Smart Diff: this file's findings from the latest review — drives the "N
   *  findings" badge, the "has findings" dot, and per-line severity overlay. */
  findings?: Finding[];
  /** Smart Diff: lock file / package.json / dist / snapshot — the open body
   *  shows a placeholder instead of the real diff, unless it has findings. */
  mechanical?: boolean;
  /** Pre-formatted "N findings" badge text. Translation lives with the caller
   *  (the `smart-diff` namespace) so this shared component never needs to know
   *  about it — existing DiffViewer callers pass neither this nor `findings`. */
  findingsLabel?: string;
  /** Pre-formatted placeholder shown instead of the real diff for a mechanical
   *  file with no findings. */
  mechanicalPlaceholderText?: string;
  /** Smart Diff: clicking a code-line severity chip jumps to that finding in
   *  "Agent runs". Plain DiffViewer callers omit it, so chips stay static. */
  onFindingClick?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const [pendingScrollLine, setPendingScrollLine] = React.useState<number | null>(null);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const lineSeverity = React.useMemo(() => severityByLine(findings), [findings]);
  const hasFindings = !!findings && findings.length > 0;

  // Force-open + scroll-to + transient highlight of the first finding's line,
  // deferred until the (just-opened) lines have actually rendered.
  React.useEffect(() => {
    if (pendingScrollLine == null) return;
    const el = document.getElementById(anchorId(file.path, pendingScrollLine));
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    const prevBackground = el.style.backgroundColor;
    const prevTransition = el.style.transition;
    el.style.transition = "background-color 0.2s ease";
    el.style.backgroundColor = "var(--accent-bg)";
    const timer = setTimeout(() => {
      el.style.backgroundColor = prevBackground;
      el.style.transition = prevTransition;
    }, 1500);
    setPendingScrollLine(null);
    return () => clearTimeout(timer);
  }, [pendingScrollLine, file.path]);

  function handleFindingsBadgeClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't also toggle the header's open/close click
    if (!findings || findings.length === 0) return;
    setOpen(true);
    setPendingScrollLine(findings[0]!.start_line);
  }

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // Mechanical files skip the real diff entirely — UNLESS they have findings,
  // in which case the finding's line needs to actually be visible.
  const showMechanicalPlaceholder = !!mechanical && !hasFindings;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {hasFindings && <span style={s.findingsDot} aria-hidden="true" />}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && (
          <button type="button" style={s.findingsBadge} onClick={handleFindingsBadgeClick}>
            {findingsLabel ?? `${findings!.length} findings`}
          </button>
        )}
        {commentCount > 0 && (
          <span style={s.commentCount}>
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {showMechanicalPlaceholder ? (
            <div style={s.mechanicalPlaceholder}>
              {mechanicalPlaceholderText ?? "Mechanical changes — diff collapsed by default"}
            </div>
          ) : lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln) => {
              const lineNo = ln.newNo ?? ln.oldNo;
              const hit = lineNo != null ? lineSeverity.get(lineNo) : undefined;
              return (
                <CodeLine
                  key={lineKey(ln)}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  anchorId={lineNo != null ? anchorId(file.path, lineNo) : undefined}
                  severity={hit?.severity}
                  findingId={hit?.findingId}
                  onFindingClick={onFindingClick}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
