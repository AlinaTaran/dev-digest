import type { BriefMissingInput, RiskSeverity } from "@devdigest/shared";

/** Spec order for the "Generated without: …" list. */
const MISSING_ORDER: readonly BriefMissingInput[] = ["intent", "blast", "specs", "description"];

export const severityRank: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

export function sha7(s: string): string {
  return s.slice(0, 7);
}

/** Human names of the missing inputs in spec order, joined with ", ". */
export function missingInputsList(
  missing: readonly BriefMissingInput[],
  t: (key: string) => string,
): string {
  return MISSING_ORDER.filter((m) => missing.includes(m))
    .map((m) => t(`prBrief.inputs.${m}`))
    .join(", ");
}

export function formatRef(path: string, start?: number | null, end?: number | null): string {
  if (!start) return path;
  return end && end !== start ? `${path}:${start}-${end}` : `${path}:${start}`;
}

const REF_RE = /^(.+):([1-9]\d{0,6})(?:-([1-9]\d{0,6}))?$/;

/** Client mirror of the server's trailing `:N(-M)?` rule; `line` is the range start. */
export function parseRefForNav(ref: string): { file: string; line?: number } {
  const m = REF_RE.exec(ref);
  if (!m) return { file: ref };
  return { file: m[1]!, line: Number(m[2]) };
}
