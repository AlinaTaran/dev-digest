/** Constants for the DiffViewer. */
import type { Severity } from "@/lib/types";
import type { SmartDiffRole } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Lock files, generated output, snapshots, and package.json — the patterns a
 *  Smart Diff file card treats as "mechanical" (collapses the real diff behind
 *  a placeholder unless it has findings). Mirrors the server's boilerplate
 *  classification (`server/src/modules/smart-diff/constants.ts`), duplicated
 *  here because the client never receives a "mechanical" flag over the wire. */
export const MECHANICAL_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)package\.json$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.snap$/,
  /(^|\/)__snapshots__\//,
  /\.min\.[a-z]+$/,
];

/** Role → marker colour for the Smart Diff group header (label + description
 *  text itself is translated — see `messages/en/smart-diff.json`'s `roles`). */
export const ROLE_META: Record<SmartDiffRole, { color: string }> = {
  core: { color: "var(--accent)" },
  wiring: { color: "var(--warn)" },
  boilerplate: { color: "var(--text-muted)" },
};

/** Severity → chip label + colour for a Smart Diff findings-line overlay. */
export const SEVERITY_CHIP: Record<Severity, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: "blocker", color: "var(--crit)", bg: "var(--crit-bg)" },
  WARNING: { label: "warning", color: "var(--warn)", bg: "var(--warn-bg)" },
  SUGGESTION: { label: "suggestion", color: "var(--sugg)", bg: "var(--sugg-bg)" },
};
