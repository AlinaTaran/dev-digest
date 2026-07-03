import type { ConventionCandidate } from "@devdigest/shared";

/** Rough token estimate (~4 chars/token). Colocated on purpose — this
    codebase keeps one local copy of this heuristic per feature rather than
    importing it cross-feature (see skills' ConfigTab/helpers.ts). */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/** Merge accepted candidates into a Markdown draft: one `## category` heading
    per distinct category (first-seen order), each followed by its rules as
    bullets with an evidence pointer. */
export function buildBodyMarkdown(candidates: ConventionCandidate[]): string {
  const order: string[] = [];
  const byCategory = new Map<string, ConventionCandidate[]>();
  for (const c of candidates) {
    if (!byCategory.has(c.category)) {
      byCategory.set(c.category, []);
      order.push(c.category);
    }
    byCategory.get(c.category)!.push(c);
  }
  return order
    .map((category) => {
      const lines = byCategory
        .get(category)!
        .map((c) => `- ${c.rule} — Detected in \`${c.evidence_path}:${c.evidence_line_start ?? "?"}\``);
      return `## ${category}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
