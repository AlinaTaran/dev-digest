/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, Finding, Severity } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, lineKey, anchorId, flashLine, type Line } from "../helpers";
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
  forceOpen,
  scrollToLine,
  lineNotInDiffText,
  onTargetReached,
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
  /** Deep link target: open the card (overrides `defaultOpen`, the size rule and
   *  the mechanical placeholder) so the target line can render. */
  forceOpen?: boolean;
  /** Deep link target: new-side line to scroll to + flash. `null` with
   *  `forceOpen` = file-only target (scroll the header). */
  scrollToLine?: number | null;
  /** Pre-formatted "line N isn't in the current diff" message. */
  lineNotInDiffText?: string;
  /** Called once the target has been scrolled to; `found` = line was rendered. */
  onTargetReached?: (found: boolean) => void;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    forceOpen ||
      (defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES)
  );
  // A fresh object per click so a repeat click on the same finding re-flashes;
  // the effect never resets it (that would cancel its own restore timer).
  const [pendingScroll, setPendingScroll] = React.useState<{ line: number } | null>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const onReachedRef = React.useRef(onTargetReached);
  onReachedRef.current = onTargetReached;
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const lineSeverity = React.useMemo(() => severityByLine(findings), [findings]);
  const hasFindings = !!findings && findings.length > 0;

  // Force-open + scroll-to + transient highlight of the first finding's line,
  // deferred until the (just-opened) lines have actually rendered.
  React.useEffect(() => {
    if (pendingScroll == null) return;
    const el = document.getElementById(anchorId(file.path, pendingScroll.line));
    if (!el) return;
    return flashLine(el);
  }, [pendingScroll, file.path]);

  React.useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // Mechanical files skip the real diff entirely — UNLESS they have findings,
  // in which case the finding's line needs to actually be visible. A deep-link
  // target (`forceOpen`) also needs the real lines.
  const showMechanicalPlaceholder = !!mechanical && !hasFindings && !forceOpen;

  // Whether the deep-link line is actually among the rendered lines. S12 residual:
  // deleted lines use `diff-line:<path>:<oldNo>` ids, which can collide with a
  // new-side line of the same number earlier in the card; getElementById returns
  // the first match. Accepted — changing anchor ids would alter the badge flow.
  const targetLineFound =
    scrollToLine != null && lines.some((ln) => ln.newNo === scrollToLine);
  const targetVisible = !!forceOpen && open && !showMechanicalPlaceholder;
  const lineMissing = targetVisible && scrollToLine != null && !targetLineFound;

  React.useEffect(() => {
    if (!targetVisible) return;
    if (scrollToLine != null && targetLineFound) {
      const el = document.getElementById(anchorId(file.path, scrollToLine));
      if (el) {
        const cleanup = flashLine(el);
        onReachedRef.current?.(true);
        return cleanup;
      }
    }
    headerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    onReachedRef.current?.(scrollToLine == null);
  }, [targetVisible, scrollToLine, targetLineFound, file.path]);

  function handleFindingsBadgeClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't also toggle the header's open/close click
    if (!findings || findings.length === 0) return;
    setOpen(true);
    setPendingScroll({ line: findings[0]!.start_line });
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

  return (
    <div style={s.fileCard}>
      <div ref={headerRef} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
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
          {lineMissing && lineNotInDiffText && (
            <div role="note" style={s.noDiff}>
              {lineNotInDiffText}
            </div>
          )}
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
