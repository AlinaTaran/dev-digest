/**
 * Domain errors. Delivery maps `code` + `details` to forward-leading text
 * (delivery/mcp/messages.ts); no wording lives here.
 *
 * `details` contract per code (adapters and use cases must provide these keys):
 *   API_UNREACHABLE  { apiUrl }
 *   API_TIMEOUT      { apiUrl, seconds }
 *   RATE_LIMITED     { retryAfterSec }
 *   API_SERVER_ERROR { status, code, message }
 *   API_VALIDATION   { status, message }
 *   BAD_RESPONSE     { path, apiUrl }
 *   ABORTED          {}                         caller's AbortSignal fired (not a failure)
 *   REPO_NOT_FOUND   { repo, known: string[] }          up to 10 full_names
 *   REPO_AMBIGUOUS   { repo, matches: string[] }
 *   PR_NOT_FOUND     { repo, pr, known: number[] }      up to 10, newest first
 *   AGENT_NOT_FOUND  { agent }
 *   AGENT_AMBIGUOUS  { agent, matches: { name, id }[] }
 *   AGENT_DISABLED   { name }
 *   RUN_FAILED       { run_id, status, error: string | null }
 *   REVIEW_MISSING   { run_id, repo, pr }
 *   RUN_NOT_FOUND    { run_id, repo, pr }
 *   NO_REVIEWS       { repo, pr, agent?: string }
 */
export type ErrorCode =
  | 'API_UNREACHABLE'
  | 'API_TIMEOUT'
  | 'RATE_LIMITED'
  | 'API_SERVER_ERROR'
  | 'API_VALIDATION'
  | 'BAD_RESPONSE'
  | 'ABORTED'
  | 'REPO_NOT_FOUND'
  | 'REPO_AMBIGUOUS'
  | 'PR_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_AMBIGUOUS'
  | 'AGENT_DISABLED'
  | 'RUN_FAILED'
  | 'REVIEW_MISSING'
  | 'RUN_NOT_FOUND'
  | 'NO_REVIEWS';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, details: Record<string, unknown> = {}, message?: string) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
