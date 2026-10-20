/** Max prior PRs returned. */
export const MAX_PRIOR_PRS = 5;
/** Max commits scanned from `git log` (resync fetches depth 50). */
export const MAX_LOG_SCAN = 50;
/** Max chars of the PR-body first line returned as `notes`. */
export const NOTES_MAX = 200;
/**
 * Max GitHub `getPullRequest` lookups for PRs missing from the DB. Each call
 * costs ~3 GitHub requests (PR + files + commits in the adapter), so keep small.
 */
export const MAX_GITHUB_ENRICH = 3;
/** Enrichment cache bounds (in-memory, per service instance). */
export const ENRICH_CACHE_MAX = 200;
export const ENRICH_CACHE_TTL_MS = 10 * 60 * 1000;
