/** Only GitHub links we can vouch for: PR links are rebuilt from `owner/name`, job links must already be GitHub. */
const GITHUB = "https://github.com/";

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function prUrl(repo: string | null, prNumber: number | null): string | null {
  return repo && REPO_RE.test(repo) && prNumber != null ? `${GITHUB}${repo}/pull/${prNumber}` : null;
}

export function jobUrl(githubUrl: string | null): string | null {
  return githubUrl && githubUrl.startsWith(GITHUB) ? githubUrl : null;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: "var(--ok)",
  no_findings: "var(--ok)",
  failed: "var(--crit)",
  running: "var(--accent)",
};

export function statusColor(status: string | null): string {
  return STATUS_COLORS[status ?? ""] ?? "var(--text-muted)";
}

export const KNOWN_STATUSES = ["succeeded", "no_findings", "failed", "running", "skipped"];
export const KNOWN_VERDICTS = ["approve", "comment", "request_changes"];
