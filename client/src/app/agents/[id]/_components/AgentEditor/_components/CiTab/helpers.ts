import type { CiRun } from "@devdigest/shared";

/** Only render GitHub links the app itself can vouch for (no `javascript:` etc.). */
export function safeGithubUrl(url: string | null | undefined): string | null {
  return url && url.startsWith("https://github.com/") ? url : null;
}

export type RelativeUnit = "now" | "minutes" | "hours" | "days";

/** Coarse "time ago" split into a unit + count so the caller can translate it. */
export function relativeParts(
  iso: string | null | undefined,
  now: number = Date.now(),
): { unit: RelativeUnit; n: number } | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const m = Math.max(0, Math.round((now - then) / 60_000));
  if (m < 1) return { unit: "now", n: 0 };
  if (m < 60) return { unit: "minutes", n: m };
  const h = Math.round(m / 60);
  if (h < 24) return { unit: "hours", n: h };
  return { unit: "days", n: Math.round(h / 24) };
}

const KNOWN_STATUSES = ["succeeded", "no_findings", "failed", "running", "skipped"] as const;
export type KnownStatus = (typeof KNOWN_STATUSES)[number];

export function knownStatus(status: string | null): KnownStatus | null {
  return (KNOWN_STATUSES as readonly string[]).includes(status ?? "") ? (status as KnownStatus) : null;
}

export function statusColor(status: KnownStatus | null): string {
  switch (status) {
    case "succeeded":
    case "no_findings":
      return "var(--ok)";
    case "failed":
      return "var(--crit)";
    case "running":
      return "var(--accent)";
    default:
      return "var(--text-muted)";
  }
}

/** Newest first, capped at the 10 runs the row shows (AC-7). */
export function latestRuns(runs: readonly CiRun[], limit = 10): CiRun[] {
  return [...runs]
    .sort((a, b) => Date.parse(b.ran_at ?? "") - Date.parse(a.ran_at ?? ""))
    .slice(0, limit);
}

export const FAIL_ON_VALUES = ["never", "critical", "warning", "any"] as const;
