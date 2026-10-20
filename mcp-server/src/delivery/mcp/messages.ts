import { isDomainError } from '../../domain/errors';
import type { LoggerPort } from '../../domain/ports';
import type { Hint } from '../../domain/types';
import { oneLine } from './sanitize';

export interface MessageContext {
  apiUrl: string;
  webUrl: string;
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const KEY_ERROR = /not configured|api[_ ]?key/i;

/** Forward-leading text for a structured hint (catalog §5). */
export function renderHint(hint: Hint, ctx: MessageContext): string {
  switch (hint.code) {
    case 'NEXT_POLL':
      return `Review still running. Call get_findings with repo="${hint.repo}", pr=${hint.pr}, run_id="${hint.run_id}" in ~30s.`;
    case 'NARROW':
      return `Showing ${hint.shown} of ${hint.total}. Narrow with severity="CRITICAL" or a higher limit (max ${hint.max}).`;
    case 'NO_AGENTS':
      return `No agents configured. Create one at ${ctx.webUrl}/agents.`;
    case 'NO_CONVENTIONS':
      return `No accepted conventions for ${hint.repo} (${hint.pending} pending). Open ${ctx.webUrl}/conventions, run Extract, and accept rules.`;
    case 'BLAST_DEGRADED':
      return `Index for ${hint.repo} is incomplete (${hint.reason ?? 'unknown'}); callers may be missing. Open ${ctx.webUrl}/repos/${hint.repo_id}/pulls/${hint.pr}, click Resync in the Blast radius block, wait ~1 min, then call get_blast_radius again.`;
    case 'BLAST_TRUNCATED':
      return `Showing ${hint.shown} of ${hint.total} changed symbols (highest-ranked first). Open the PR Overview in DevDigest for the full map.`;
  }
}

/**
 * Error -> text for `isError` results. DomainErrors use the catalog; anything else is
 * logged to stderr and replaced by a generic message (never a stack trace).
 */
export function describeError(
  err: unknown,
  toolName: string,
  ctx: MessageContext,
  logger: LoggerPort,
): string {
  if (!isDomainError(err)) {
    logger.error(`tool ${toolName} failed`, {
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    return `Internal error in devdigest MCP tool "${toolName}". See the MCP server stderr log.`;
  }

  const d = err.details;
  switch (err.code) {
    case 'API_UNREACHABLE':
      return `DevDigest API not reachable at ${ctx.apiUrl}. Start it with ./scripts/dev.sh (or cd server && pnpm dev), then retry.`;
    case 'API_TIMEOUT':
      return `DevDigest API at ${ctx.apiUrl} did not answer within ${num(d.seconds)}s. Check the server is healthy (GET ${ctx.apiUrl}/health/ready), then retry.`;
    case 'RATE_LIMITED':
      return `DevDigest rate limit hit (review runs: 10/min). Wait ~${num(d.retryAfterSec, 60)}s and retry, or call get_findings for an existing run.`;
    case 'API_SERVER_ERROR':
      return `DevDigest API error ${num(d.status)} (${str(d.code, 'unknown')}): ${clip(str(d.message), 200)}. Check the server terminal; if Postgres is down run ./scripts/dev.sh.`;
    case 'API_VALIDATION':
      return `DevDigest rejected the request: ${clip(str(d.message), 200)}.`;
    case 'BAD_RESPONSE':
      return `Unexpected response from ${str(d.path)}. Is DEVDIGEST_API_URL (${ctx.apiUrl}) pointing at the DevDigest API?`;
    case 'ABORTED':
      return 'Request cancelled.';
    case 'REPO_NOT_FOUND': {
      const known = list(d.known).map(String);
      return `Repo "${str(d.repo)}" is not in DevDigest. Add it at ${ctx.webUrl}. Known repos: ${known.length ? known.join(', ') : 'none'}.`;
    }
    case 'REPO_AMBIGUOUS':
      return `"${str(d.repo)}" matches several repos: ${list(d.matches).map(String).join(', ')}. Pass "owner/name".`;
    case 'PR_NOT_FOUND': {
      const known = list(d.known).map((n) => `#${String(n)}`);
      return `PR #${num(d.pr)} not found in ${str(d.repo)}. Known PRs: ${known.length ? known.join(', ') : 'none'}. If it is new, configure a GitHub token in DevDigest Settings (${ctx.webUrl}/settings) so the list syncs, then retry.`;
    }
    case 'AGENT_NOT_FOUND':
      return `Agent "${str(d.agent)}" not found. Call list_agents and pass an id or exact name.`;
    case 'AGENT_AMBIGUOUS': {
      const matches = list(d.matches).map((m) => {
        const o = (m ?? {}) as Record<string, unknown>;
        return `${str(o.name)} (${str(o.id)})`;
      });
      return `Agent name "${str(d.agent)}" is ambiguous: ${matches.join(', ')}. Pass the id.`;
    }
    case 'AGENT_DISABLED':
      return `Agent "${str(d.name)}" is disabled. Enable it at ${ctx.webUrl}/agents, or call list_agents and choose an enabled agent.`;
    case 'RUN_FAILED': {
      const reason = typeof d.error === 'string' && d.error !== '' ? clip(oneLine(d.error), 300) : 'no reason recorded';
      const keyHint = KEY_ERROR.test(str(d.error))
        ? ` Configure the model provider key in DevDigest Settings (${ctx.webUrl}/settings), then run again.`
        : '';
      return `Review run ${str(d.run_id)} ${str(d.status)}: ${reason}.${keyHint}`;
    }
    case 'REVIEW_MISSING':
      return `Run ${str(d.run_id)} finished but no review was stored. Call get_findings with repo="${str(d.repo)}", pr=${num(d.pr)}.`;
    case 'RUN_NOT_FOUND':
      return `Run ${str(d.run_id)} not found on ${str(d.repo)}#${num(d.pr)}. Omit run_id to get the latest review.`;
    case 'NO_REVIEWS': {
      const by = typeof d.agent === 'string' && d.agent !== '' ? ` by agent "${d.agent}"` : '';
      return `No reviews yet for ${str(d.repo)}#${num(d.pr)}${by}. Call run_agent_on_pr to start one.`;
    }
  }
}
