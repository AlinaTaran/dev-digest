
const SECRET_PATTERNS: RegExp[] = [
  /sk_live_[A-Za-z0-9]+/g,
  /sk_test_[A-Za-z0-9]+/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /xox[bpsa]-[0-9A-Za-z-]+/g,
];

export function maskSecrets(s: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '***'), s);
}

interface MaskableBrief {
  summary: string;
  risks: { kind: string; title: string; explanation: string }[];
  review_focus: { reason: string }[];
}

/** Masks free-text fields only; paths and lines are never touched. */
export function maskBrief<T extends MaskableBrief>(parts: T): T {
  return {
    ...parts,
    summary: maskSecrets(parts.summary),
    risks: parts.risks.map((r) => ({
      ...r,
      kind: maskSecrets(r.kind),
      title: maskSecrets(r.title),
      explanation: maskSecrets(r.explanation),
    })),
    review_focus: parts.review_focus.map((f) => ({ ...f, reason: maskSecrets(f.reason) })),
  };
}

