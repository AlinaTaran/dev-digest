import path from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';

/**
 * Best-effort resolution of plan/spec/reference material linked from a PR
 * body, for the Intent classifier's cheap-signals input. Resolves THREE
 * source kinds, each skipped silently on failure, all concatenated and
 * capped to `MAX_REF_CHARS`:
 *
 * (a) repo files (`docs/plans/*.md`, `specs/*`, any `*.md`) read via
 *     `container.git.readFile` — guarded against path traversal (see
 *     `isSafeRepoPath`);
 * (b) `#N` / full GitHub issue-or-PR URL references fetched via
 *     `container.github()` — skipped silently when no GitHub token is
 *     configured or the API call fails;
 * (c) external (non-GitHub) http(s) URLs fetched via `container.webFetch`
 *     — SSRF-guarded centrally by that adapter; skipped silently when
 *     fetching is disabled, the URL is blocked, or the request fails.
 *
 * Returns `undefined` when nothing resolved.
 */

const MAX_REF_CHARS = 12000;
const MAX_REFS_PER_KIND = 5;
const MAX_EXTERNAL_URLS = 3;

const PLAN_PATH_RE = /`?((?:docs\/plans|specs)\/[\w.\-/]+|[\w.\-]+\.md)`?/g;
const ISSUE_NUMBER_RE = /#(\d+)/g;
const ISSUE_URL_RE = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/(\d+)/g;
const URL_RE = /https?:\/\/[^\s)>\]"']+/g;

/**
 * Rejects any candidate path that is absolute or whose normalized form
 * escapes the repo root (contains a `..` segment). This guard exists
 * because `container.git.readFile` (`adapters/git/simple-git.ts`) does
 * `readFile(join(clonePathFor(repo), path), 'utf8')` with NO confinement
 * of its own — it happily joins and reads whatever path it's given,
 * including one that walks out of the clone directory via `..` segments.
 * Since the path comes from an attacker-controlled PR body, this check
 * MUST run before every `readFile` call in this module.
 */
export function isSafeRepoPath(p: string): boolean {
  const norm = path.posix.normalize(p);
  if (path.posix.isAbsolute(norm)) return false;
  if (norm === '..' || norm.startsWith('../')) return false;
  if (norm.split('/').includes('..')) return false;
  return true;
}

export async function resolveReferences(
  body: string | null | undefined,
  repo: RepoRef,
  container: Container,
  /** Issue numbers already fetched elsewhere (e.g. the PR's own linked issue) —
   *  excluded here so the same `#N` isn't fetched twice and duplicated in the prompt. */
  excludeIssueNumbers: readonly number[] = [],
): Promise<string | undefined> {
  if (!body || body.trim().length === 0) return undefined;

  const blocks: string[] = [];

  // (a) Repo files — traversal-guarded before any readFile call.
  const candidatePaths = [
    ...new Set(
      [...body.matchAll(PLAN_PATH_RE)]
        .map((m) => m[1])
        .filter((p): p is string => p != null),
    ),
  ];
  const safePaths = candidatePaths.filter(isSafeRepoPath).slice(0, MAX_REFS_PER_KIND);
  for (const p of safePaths) {
    const content = await container.git.readFile(repo, p).catch(() => null);
    if (content != null) blocks.push(`--- ${p} ---\n${content}`);
  }

  // (b) GitHub issues/PRs — unchanged from the prior resolvePlanRefs behavior.
  const issueNumbers = [...new Set([...body.matchAll(ISSUE_URL_RE)].map((m) => Number(m[1])))];
  for (const m of body.matchAll(ISSUE_NUMBER_RE)) {
    const n = Number(m[1]);
    if (!issueNumbers.includes(n)) issueNumbers.push(n);
  }
  const dedupedIssues = issueNumbers.filter((n) => !excludeIssueNumbers.includes(n));
  for (const n of dedupedIssues.slice(0, MAX_REFS_PER_KIND)) {
    try {
      const gh = await container.github();
      const issue = await gh.getIssue(repo, n);
      blocks.push(`--- #${n} ${issue.title} ---\n${issue.body ?? ''}`);
    } catch {
      // no GitHub token configured, or the issue/PR doesn't exist — best-effort
    }
  }

  // (c) External URLs (non-GitHub-issue links) — routed through
  // container.webFetch so the SSRF guard + EXTERNAL_FETCH_ENABLED gate
  // apply centrally; never call global fetch() directly here.
  // Strip trailing sentence punctuation the greedy URL_RE would otherwise capture
  // (e.g. "see https://example.com." → "https://example.com").
  const allUrls = [
    ...new Set([...body.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?]+$/, ''))),
  ];
  const externalUrls = allUrls
    .filter((u) => {
      ISSUE_URL_RE.lastIndex = 0;
      return !ISSUE_URL_RE.test(u);
    })
    .slice(0, MAX_EXTERNAL_URLS);
  for (const url of externalUrls) {
    const result = await container.webFetch.fetch(url).catch(() => null);
    if (result != null) blocks.push(`--- ${url} ---\n${result.text}`);
  }

  if (blocks.length === 0) return undefined;
  return blocks.join('\n\n').slice(0, MAX_REF_CHARS);
}
