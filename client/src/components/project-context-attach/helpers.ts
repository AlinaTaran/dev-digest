import type { ContextDoc } from "@devdigest/shared";

/** Move the item at `from` to `to`, returning a new array. */
export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items.slice();
  }
  const next = items.slice();
  const moved = next.splice(from, 1)[0]!;
  next.splice(to, 0, moved);
  return next;
}

/** Case-insensitive substring match on the doc path (AC-19). */
export function matchesFilter(path: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || path.toLowerCase().includes(q);
}

/** Split a repo-relative path into `{ name, dir }` for rows with no listing entry (missing docs). */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i === -1 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}

/** Paths after toggling `path`: check appends (AC-16), uncheck keeps relative order (AC-17). */
export function togglePath(paths: readonly string[], path: string, checked: boolean): string[] {
  return checked ? [...paths.filter((p) => p !== path), path] : paths.filter((p) => p !== path);
}

export function docsByPath(docs: readonly ContextDoc[]): Map<string, ContextDoc> {
  return new Map(docs.map((d) => [d.path, d]));
}

/** Badge colours for a doc type: specs blue, docs green, insights amber, other neutral (CSS vars only). */
export function contextDocTypeTone(type: string): { color: string; bg: string } {
  switch (type) {
    case "specs":
      return { color: "var(--accent-text)", bg: "var(--accent-bg)" };
    case "docs":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "insights":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    default:
      return { color: "var(--text-secondary)", bg: "var(--bg-hover)" };
  }
}
