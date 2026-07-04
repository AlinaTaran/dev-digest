import type { ConventionCandidate } from "@devdigest/shared";

/** Rough token estimate (~4 chars/token). Colocated on purpose — this
    codebase keeps one local copy of this heuristic per feature rather than
    importing it cross-feature (see skills' ConfigTab/helpers.ts). */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/** kebab-case a rule's text for use as a Markdown heading anchor, e.g.
    "Always use async/await instead of .then() chains" → "always-use-async-await-instead-of-then-chains". */
export function slugifyRule(rule: string): string {
  return (
    rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "rule"
  );
}

function evidenceRange(c: ConventionCandidate): string {
  if (c.evidence_line_start == null) return c.evidence_path;
  if (c.evidence_line_end == null || c.evidence_line_end === c.evidence_line_start) {
    return `${c.evidence_path}:${c.evidence_line_start}`;
  }
  return `${c.evidence_path}:${c.evidence_line_start}-${c.evidence_line_end}`;
}

/** Merge accepted candidates into a Markdown draft: an H1 title + directive
    intro, then one `## <rule-slug>` section per candidate with the rule text
    and its evidence (file:line + the actual snippet in a fenced code block),
    so the resulting skill gives a reviewing agent real grounding, not just a
    bullet list. */
export function buildBodyMarkdown(name: string, candidates: ConventionCandidate[]): string {
  const repoLabel = name.replace(/-conventions$/, "") || name;
  const intro = `House conventions for \`${repoLabel}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = candidates.map((c) => {
    const heading = `## ${slugifyRule(c.rule)}`;
    const snippet = c.evidence_snippet ? `\n\`\`\`\n${c.evidence_snippet}\n\`\`\`` : "";
    return `${heading}\n${c.rule}\n\nDetected in \`${evidenceRange(c)}\`:${snippet}`;
  });
  return [`# ${name}`, intro, ...sections].join("\n\n");
}
