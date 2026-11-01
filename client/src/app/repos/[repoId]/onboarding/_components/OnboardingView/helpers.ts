import React from "react";

export const SHORT_SHA = 7;

export const shortSha = (sha: string | null | undefined): string => (sha ?? "").slice(0, SHORT_SHA);

/** `acme/payments-api` → `payments-api`. */
export const repoName = (fullName: string): string => fullName.split("/").pop() || fullName;

export type AgoUnit = "justNow" | "minutes" | "hours" | "days";

/** Compact relative time as an i18n key + count (rendered via `onboarding.ago.<unit>`). */
export function agoParts(iso: string, now: number = Date.now()): { unit: AgoUnit; count: number } {
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(secs) || secs < 60) return { unit: "justNow", count: 0 };
  const mins = Math.floor(secs / 60);
  if (mins < 60) return { unit: "minutes", count: mins };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}

/** Whole seconds since `startedAt`, ticking every second while `active`. */
export function useElapsedSeconds(startedAt: string | null | undefined, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** Smooth-scroll an element into view; jsdom/old browsers may lack the method. */
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}
