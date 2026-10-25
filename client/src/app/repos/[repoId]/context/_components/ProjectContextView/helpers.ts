import type { ContextDocType } from "@devdigest/shared";

/** Badge colours per doc type (text label is always shown too — never colour alone). */
export const TYPE_COLORS: Record<ContextDocType, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
  other: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export type RelativeTime = { key: "justNow" | "minutes" | "hours" | "days"; n: number };

/** Coarse "scanned N ago" bucket; the caller maps it to an i18n string. */
export function relativeTime(iso: string, now: number = Date.now()): RelativeTime {
  const ms = now - Date.parse(iso);
  const min = Math.floor(ms / 60_000);
  if (!Number.isFinite(min) || min < 1) return { key: "justNow", n: 0 };
  if (min < 60) return { key: "minutes", n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { key: "hours", n: h };
  return { key: "days", n: Math.floor(h / 24) };
}

/** Distinct agents among a doc's `used_by_agents` rows (an agent can appear via itself and via a skill). */
export function distinctAgentCount(rows: { agent_id: string }[]): number {
  return new Set(rows.map((r) => r.agent_id)).size;
}
